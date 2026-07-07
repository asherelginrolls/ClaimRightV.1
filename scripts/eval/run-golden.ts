// Golden-case eval gate (CLAUDE.md §11). No KB/prompt/pipeline change ships if
// a golden case regresses.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/eval/run-golden.ts --baseline
//     → raw Sonnet 4.6, NO knowledge base, no gating. Records the "ungated
//       model" answer per case to docs/eval-baseline.md so "are we at least
//       as good as raw Sonnet?" is measurable.
//
//   npx tsx --env-file=.env.local scripts/eval/run-golden.ts
//     → full REASON→GROUND→VALIDATE pipeline (lib/reasoning.ts, Phase 3).
//       Requires Supabase + populated KB. Asserts expected_angles present,
//       must_not_say absent, citations real. Exit 1 on any failure.
//
// Checks per case:
//   - expected_angles: each angle passes if ANY of its regexes matches.
//   - must_not_say:   FAILS if any regex matches (the inverted-argument trap).
//   - judge_question: Haiku 4.5 as a strict YES/NO judge; YES = failure.
//   - citations (pipeline mode only): every [Source:] must reference a
//     retrieved chunk; expected_citations source titles must appear.

import fs from 'fs'
import path from 'path'
import { getAnthropicClient } from '../../lib/claude'

// ── Types ────────────────────────────────────────────────────────────────────

interface GoldenAngle {
  id: string
  description: string
  match_patterns: string[]
}

interface GoldenMustNot {
  id: string
  description: string
  patterns: string[]
}

interface GoldenCase {
  id: string
  title: string
  facts: {
    insurer: string | null
    claim_amount: number | null
    rejection_date: string | null
    rejection_reason_raw: string | null
    rejection_reason_category: string
    documents_requested_count: number | null
    policy_age_months: number | null
    policy_type: string
    rejection_reason_confidence: number
  }
  extra_context: {
    primary_diagnosis?: string
    exclusion_code_cited?: string
    decision_delay_days?: number
    narrative: string
  }
  expected_angles: GoldenAngle[]
  expected_citations: string[]
  must_not_say: GoldenMustNot[]
  judge_question?: string
}

interface CaseResult {
  caseId: string
  anglesFound: Array<{ id: string; found: boolean }>
  mustNotViolations: Array<{ id: string; matched: string }>
  judgeVerdict: 'PASS' | 'FAIL' | 'SKIPPED' | 'ERROR'
  citationsOk: boolean | null // null = not checked (baseline mode)
  passed: boolean
  letterText: string
}

// ── Checks (shared by baseline + pipeline modes) ─────────────────────────────

function checkAngles(text: string, c: GoldenCase): Array<{ id: string; found: boolean }> {
  return c.expected_angles.map((a) => ({
    id: a.id,
    found: a.match_patterns.some((p) => new RegExp(p, 'i').test(text)),
  }))
}

function checkMustNotSay(text: string, c: GoldenCase): Array<{ id: string; matched: string }> {
  const violations: Array<{ id: string; matched: string }> = []
  for (const m of c.must_not_say) {
    for (const p of m.patterns) {
      const match = new RegExp(p, 'i').exec(text)
      if (match) {
        violations.push({ id: m.id, matched: match[0].slice(0, 140) })
        break
      }
    }
  }
  return violations
}

async function judgeCase(text: string, c: GoldenCase): Promise<'PASS' | 'FAIL' | 'SKIPPED' | 'ERROR'> {
  if (!c.judge_question) return 'SKIPPED'
  try {
    const msg = await getAnthropicClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      temperature: 0,
      system:
        'You are a strict evaluator of legal dispute letters. Answer ONLY the single word YES or NO.',
      messages: [
        {
          role: 'user',
          content: `LETTER:\n${text}\n\nQUESTION: ${c.judge_question}`,
        },
      ],
    })
    const answer = (msg.content[0]?.type === 'text' ? msg.content[0].text : '').trim().toUpperCase()
    return answer.startsWith('YES') ? 'FAIL' : 'PASS'
  } catch (err) {
    console.error(`  judge error: ${String(err).slice(0, 120)}`)
    return 'ERROR'
  }
}

function evaluateText(text: string, c: GoldenCase): Omit<CaseResult, 'judgeVerdict' | 'citationsOk'> {
  const anglesFound = checkAngles(text, c)
  const mustNotViolations = checkMustNotSay(text, c)
  return {
    caseId: c.id,
    anglesFound,
    mustNotViolations,
    passed: anglesFound.every((a) => a.found) && mustNotViolations.length === 0,
    letterText: text,
  }
}

// ── Baseline mode: raw Sonnet 4.6, no KB ─────────────────────────────────────

async function runBaselineCase(c: GoldenCase): Promise<CaseResult> {
  const rupees = c.facts.claim_amount != null ? (c.facts.claim_amount / 100).toLocaleString('en-IN') : 'unknown'
  const prompt = [
    `You are helping an Indian health-insurance policyholder dispute a rejected claim.`,
    ``,
    `CASE FACTS:`,
    `- Insurer: ${c.facts.insurer}`,
    `- Claim amount: ₹${rupees}`,
    `- Rejection date: ${c.facts.rejection_date}`,
    `- Rejection reason (verbatim): ${c.facts.rejection_reason_raw}`,
    `- Policy age: ${c.facts.policy_age_months} months`,
    `- Separate document requests received: ${c.facts.documents_requested_count}`,
    c.extra_context.primary_diagnosis ? `- Diagnosis: ${c.extra_context.primary_diagnosis}` : '',
    c.extra_context.decision_delay_days ? `- Days from admission to decision: ${c.extra_context.decision_delay_days}` : '',
    `- Background: ${c.extra_context.narrative}`,
    ``,
    `Write a formal grievance letter to the insurer's Grievance Redressal Officer disputing this rejection.`,
    `Use formal Indian legal-correspondence English. Make the STRONGEST legal arguments available under`,
    `IRDAI regulations. 3–5 numbered argument paragraphs, then relief sought.`,
  ].filter(Boolean).join('\n')

  // Build-time eval: allow longer than the 30s runtime cap for the full letter.
  const msg = await getAnthropicClient().messages.create(
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    },
    { timeout: 180_000 }
  )
  const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''

  const base = evaluateText(text, c)
  const judgeVerdict = await judgeCase(text, c)
  return {
    ...base,
    judgeVerdict,
    citationsOk: null,
    passed: base.passed && judgeVerdict !== 'FAIL',
  }
}

// ── Pipeline mode: full REASON→GROUND→VALIDATE (Phase 3) ─────────────────────

async function runPipelineCase(c: GoldenCase, mockKb: boolean): Promise<CaseResult> {
  const { runReasoningPipelineForEval } = await import('../../lib/reasoning')

  let retriever
  if (mockKb) {
    const { makeMockRetriever } = await import('./mock-retriever')
    retriever = makeMockRetriever(process.cwd())
  }

  const out = await runReasoningPipelineForEval(
    {
      facts: {
        insurer: c.facts.insurer,
        claim_amount: c.facts.claim_amount,
        rejection_date: c.facts.rejection_date,
        rejection_reason_raw: c.facts.rejection_reason_raw,
        rejection_reason_category: c.facts.rejection_reason_category,
        documents_requested_count: c.facts.documents_requested_count,
        policy_age_months: c.facts.policy_age_months,
        policy_type: c.facts.policy_type,
        rejection_reason_confidence: c.facts.rejection_reason_confidence,
      },
      extraContext: c.extra_context.narrative,
      primaryDiagnosis: c.extra_context.primary_diagnosis ?? null,
    },
    retriever ? { retriever } : {}
  )
  if (out.usedFallback) {
    console.log('  ⚠ strategize fell back to single-query retrieval for this case')
  }

  const text = out.letterText
  const base = evaluateText(text, c)
  const judgeVerdict = await judgeCase(text, c)

  // Citation honesty: every [Source:] in the letter must reference a retrieved
  // chunk source title, and each expected citation must appear.
  const sourceMarkers = Array.from(text.matchAll(/\[Source:\s*([^\]—,]+)/g)).map((m) => m[1].trim())
  const retrievedTitles = out.retrievedSourceTitles
  const fabricated = sourceMarkers.filter(
    (s) => !retrievedTitles.some((t) => t.toLowerCase().includes(s.toLowerCase().slice(0, 24)) || s.toLowerCase().includes(t.toLowerCase().slice(0, 24)))
  )
  // Each expected_citations entry may contain "|"-separated alternatives;
  // the entry passes if ANY alternative appears.
  const expectedPresent = c.expected_citations.every((exp) =>
    exp.split('|').some(
      (alt) =>
        sourceMarkers.some((s) => s.toLowerCase().includes(alt.toLowerCase())) ||
        text.toLowerCase().includes(alt.toLowerCase())
    )
  )
  const citationsOk = fabricated.length === 0 && expectedPresent
  if (fabricated.length > 0) console.log(`  ✗ citations not in retrieved set: ${fabricated.join(' | ')}`)
  if (!expectedPresent) console.log(`  ✗ expected citation(s) missing: ${c.expected_citations.join(', ')}`)

  return {
    ...base,
    judgeVerdict,
    citationsOk,
    passed: base.passed && judgeVerdict !== 'FAIL' && citationsOk,
  }
}

// ── Reporting ────────────────────────────────────────────────────────────────

function printResult(c: GoldenCase, r: CaseResult): void {
  console.log(`\n━━ ${c.id} — ${r.passed ? '✓ PASS' : '✗ FAIL'}`)
  for (const a of r.anglesFound) {
    console.log(`  angle ${a.found ? '✓' : '✗'} ${a.id}`)
  }
  for (const v of r.mustNotViolations) {
    console.log(`  must_not_say VIOLATED [${v.id}]: "...${v.matched}..."`)
  }
  if (r.judgeVerdict !== 'SKIPPED') console.log(`  judge: ${r.judgeVerdict}`)
  if (r.citationsOk !== null) console.log(`  citations real + expected present: ${r.citationsOk ? '✓' : '✗'}`)
}

function writeBaselineDoc(cases: GoldenCase[], results: CaseResult[]): void {
  const lines: string[] = [
    '# Raw-Sonnet baseline — golden eval cases',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/eval/run-golden.ts --baseline\`.`,
    'Model: claude-sonnet-4-6, temperature 0, NO knowledge base, no citation gating.',
    '',
    'This is the "ungated model" reference: the pipeline (REASON→GROUND→VALIDATE) must be',
    'at least as good as this on every case — same angles found, same traps avoided — while',
    'adding real, verified citations. Re-generate only deliberately; commits of this file',
    'move the bar.',
    '',
    '> **Caution:** these ungated letters routinely FABRICATE citation specifics (invented',
    '> circular reference numbers, regulation clauses, court case names). That is precisely',
    '> the failure mode the citation-gated pipeline exists to prevent. The baseline is the',
    '> bar for *legal reasoning quality* (angles found, traps avoided) — never for citation',
    '> practice.',
    '',
  ]
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    const r = results[i]
    lines.push(`---`, ``, `## ${c.id} — ${r.passed ? 'PASS' : 'FAIL'}`)
    lines.push(``, `**${c.title}**`, ``)
    lines.push(`| check | result |`, `|---|---|`)
    for (const a of r.anglesFound) lines.push(`| angle: ${a.id} | ${a.found ? '✓ found' : '✗ missing'} |`)
    for (const m of c.must_not_say) {
      const v = r.mustNotViolations.find((x) => x.id === m.id)
      lines.push(`| must_not_say: ${m.id} | ${v ? `✗ VIOLATED (${v.matched.slice(0, 60)}…)` : '✓ clean'} |`)
    }
    lines.push(`| judge | ${r.judgeVerdict} |`)
    lines.push(``, `<details><summary>Full baseline letter</summary>`, ``, '```', r.letterText, '```', ``, `</details>`, ``)
  }
  const outPath = path.join(process.cwd(), 'docs', 'eval-baseline.md')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
  console.log(`\nBaseline written to docs/eval-baseline.md`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const baselineMode = process.argv.includes('--baseline')
  const mockKb = process.argv.includes('--mock-kb')
  const raw = fs.readFileSync(path.join(__dirname, 'golden-cases.json'), 'utf8')
  let cases = (JSON.parse(raw) as { cases: GoldenCase[] }).cases

  // --case <id> reruns a single case (e.g. after fixing its expectations);
  // the full suite remains the gate for KB/prompt/pipeline changes.
  const caseFlagIdx = process.argv.indexOf('--case')
  if (caseFlagIdx !== -1) {
    const wanted = process.argv[caseFlagIdx + 1]
    cases = cases.filter((c) => c.id === wanted)
    if (cases.length === 0) {
      console.error(`No golden case with id "${wanted}"`)
      process.exit(1)
    }
  }

  const modeLabel = baselineMode
    ? 'BASELINE (raw Sonnet, no KB)'
    : mockKb
      ? 'PIPELINE (mock lexical KB — pseudo-similarities; pipeline mechanics only)'
      : 'PIPELINE (live Supabase KB)'
  console.log(`Golden eval — ${cases.length} case(s), mode: ${modeLabel}`)

  const results: CaseResult[] = []
  for (const c of cases) {
    console.log(`\nRunning ${c.id}...`)
    let r: CaseResult
    try {
      r = baselineMode ? await runBaselineCase(c) : await runPipelineCase(c, mockKb)
    } catch (err) {
      console.error(`  ✗ case errored: ${err instanceof Error ? err.message : String(err)}`)
      r = {
        caseId: c.id,
        anglesFound: c.expected_angles.map((a) => ({ id: a.id, found: false })),
        mustNotViolations: [],
        judgeVerdict: 'ERROR',
        citationsOk: baselineMode ? null : false,
        passed: false,
        letterText: `(run error: ${err instanceof Error ? err.message : String(err)})`,
      }
    }
    printResult(c, r)
    results.push(r)
  }

  const passed = results.filter((r) => r.passed).length
  console.log(`\n${'─'.repeat(60)}\n${passed}/${results.length} golden case(s) pass`)

  if (baselineMode) {
    writeBaselineDoc(cases, results)
    // Baseline is informational — it records what raw Sonnet does (including
    // any failures); it does not gate. Exit 0 unless the run itself errored.
    process.exit(0)
  }
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1) })
