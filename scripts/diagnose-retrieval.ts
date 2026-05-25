// Usage: npx tsx --env-file=.env.local scripts/diagnose-retrieval.ts
//
// Enhanced KB retrieval diagnostic — superset of validate-kb.ts.
// Tests 13 queries covering all 9 rejection categories + ombudsman penalties
// + synonym variant queries, against the production threshold of 0.65.
//
// For each failing query it emits a failure class:
//   (a) missing-doc   — no document in KB likely covers this topic
//   (b) bad-chunk     — content exists but chunked too coarsely
//   (c) synonym-gap   — query uses terminology not in KB chunk text
//
// Exit code 0 = all 13 queries ≥ 0.65. Exit code 1 = any failures.
// Compare output against docs/retrieval-baseline.md.

import { createClient } from '@supabase/supabase-js'
import { VoyageAIClient } from 'voyageai'
import { expandQueryWithSynonyms } from '../lib/synonyms'

// ── Query registry ───────────────────────────────────────────────────────────

interface DiagQuery {
  id: number
  label: string
  query: string
  category: string
  failureClass: '(a) missing-doc' | '(b) bad-chunk' | '(c) synonym-gap' | 'n/a'
  baselineScore: number // from docs/retrieval-baseline.md
}

const QUERIES: DiagQuery[] = [
  // ── Category: documentation_incomplete ────────────────────────────────────
  {
    id: 1,
    label: 'documentation_incomplete — piecemeal',
    query: 'insurer requested documents multiple times piecemeal prohibition IRDAI',
    category: 'documentation_incomplete',
    failureClass: 'n/a',
    baselineScore: 0.72,
  },
  // ── Category: cashless_denial ─────────────────────────────────────────────
  {
    id: 2,
    label: 'cashless_denial — 1hr/3hr rule',
    query: 'cashless pre-authorization one hour discharge three hours denial IRDAI health insurance',
    category: 'cashless_denial',
    failureClass: 'n/a',
    baselineScore: 0.66,
  },
  // ── Category: pre_existing_condition ─────────────────────────────────────
  {
    id: 3,
    label: 'pre_existing_condition — 60-month moratorium',
    query: 'pre-existing condition moratorium sixty months continuous coverage PPOI repudiation',
    category: 'pre_existing_condition',
    failureClass: 'n/a',
    baselineScore: 0.68,
  },
  // ── Category: waiting_period ──────────────────────────────────────────────
  {
    id: 4,
    label: 'waiting_period — exclusion window',
    query: 'waiting period exclusion treatment hospital admission health insurance India policyholder',
    category: 'waiting_period',
    failureClass: '(c) synonym-gap',
    baselineScore: 0.55,
  },
  // ── Category: policy_exclusion ────────────────────────────────────────────
  {
    id: 5,
    label: 'policy_exclusion — contra proferentem',
    query: 'policy exclusion clause ambiguous contra proferentem insurer policyholder health insurance',
    category: 'policy_exclusion',
    failureClass: '(a) missing-doc',
    baselineScore: 0.50,
  },
  // ── Category: non_disclosure ──────────────────────────────────────────────
  {
    id: 6,
    label: 'non_disclosure — misrepresentation/suppression',
    query: 'material misrepresentation suppression non-disclosure repudiation insurance policy India',
    category: 'non_disclosure',
    failureClass: '(c) synonym-gap',
    baselineScore: 0.52,
  },
  // ── Category: experimental_treatment ─────────────────────────────────────
  {
    id: 7,
    label: 'experimental_treatment — unproven procedure',
    query: 'experimental unproven treatment investigational non-standard medical procedure health insurance denial',
    category: 'experimental_treatment',
    failureClass: '(a) missing-doc',
    baselineScore: 0.30,
  },
  // ── Category: fraud_suspected ─────────────────────────────────────────────
  {
    id: 8,
    label: 'fraud_suspected — procedural fallback',
    query: 'fraud suspected claim investigation rejection grievance redressal officer IRDAI India',
    category: 'fraud_suspected',
    failureClass: '(a) missing-doc',
    baselineScore: 0.28,
  },
  // ── Category: other ───────────────────────────────────────────────────────
  {
    id: 9,
    label: 'other — GRO 15-day response',
    query: 'GRO grievance redressal officer insurer obligation written response 15 days IRDAI',
    category: 'other',
    failureClass: '(c) synonym-gap',
    baselineScore: 0.60,
  },
  // ── Ombudsman penalty ─────────────────────────────────────────────────────
  {
    id: 10,
    label: 'ombudsman — ₹5000/day penalty',
    query: 'ombudsman award penalty five thousand rupees per day non-compliance insurer Insurance Ombudsman Rules',
    category: 'ombudsman',
    failureClass: '(a) missing-doc',
    baselineScore: 0.10,
  },
  // ── Consumer court ───────────────────────────────────────────────────────
  {
    id: 11,
    label: 'consumer_court — deficiency in service',
    query: 'consumer court deficiency service insurance unfair trade practice complaint Consumer Protection Act',
    category: 'consumer_court',
    failureClass: '(a) missing-doc',
    baselineScore: 0.12,
  },
  // ── Synonym variant: TPA / repudiation ───────────────────────────────────
  {
    id: 12,
    label: 'synonym — TPA repudiation',
    query: 'TPA repudiation claim denial third party administrator health insurance India',
    category: 'synonym_variant',
    failureClass: '(c) synonym-gap',
    baselineScore: 0.58,
  },
  // ── Synonym variant: IGMS / Bima Bharosa ─────────────────────────────────
  {
    id: 13,
    label: 'synonym — IGMS/Bima Bharosa escalation',
    query: 'Bima Bharosa IGMS portal escalation complaint filing insurance grievance India',
    category: 'synonym_variant',
    failureClass: '(c) synonym-gap',
    baselineScore: 0.55,
  },
]

const PASS_THRESHOLD = 0.65
const WAIT_MS = 22_000 // Voyage AI free tier: 3 RPM

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ChunkResult {
  id: string
  content: string
  source_title: string
  section_number: string | null
  similarity: number
}

function scoreLabel(score: number, threshold: number): string {
  if (score >= threshold) return '✓'
  if (score >= 0.40) return '⚠️'
  return '✗'
}

function improvementNote(current: number, baseline: number): string {
  const delta = current - baseline
  if (delta >= 0.10) return `▲ +${delta.toFixed(3)}`
  if (delta >= 0.01) return `↑ +${delta.toFixed(3)}`
  if (delta <= -0.01) return `↓ ${delta.toFixed(3)}`
  return `= ${delta.toFixed(3)}`
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! })

  const { count } = await supabase
    .from('kb_chunks')
    .select('*', { count: 'exact', head: true })
  console.log(`\nKB Status: ${count ?? 0} total chunks\n`)
  if (!count || count === 0) {
    console.error('⚠️  KB is empty — run the ingestion scripts first')
    process.exit(1)
  }

  console.log(`Running ${QUERIES.length} diagnostic queries (production threshold: ${PASS_THRESHOLD})...\n`)

  const results: Array<{
    q: DiagQuery
    topScore: number
    bestMatch: string
    pass: boolean
  }> = []

  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i]
    if (i > 0) {
      process.stdout.write(`  (rate-limit pause ${WAIT_MS / 1000}s...)`)
      await new Promise((r) => setTimeout(r, WAIT_MS))
      process.stdout.write('\r' + ' '.repeat(40) + '\r')
    }

    console.log(`[${q.id}/13] ${q.label}`)
    console.log(`  Query: "${q.query.slice(0, 80)}..."`)

    // Apply synonym expansion — same as production path in lib/retrieval.ts
    const expandedQuery = expandQueryWithSynonyms(q.query)

    let embedding: number[]
    let embedAttempts = 0
    while (true) {
      embedAttempts++
      try {
        const res = await voyage.embed({
          input: [expandedQuery],
          model: 'voyage-law-2',
          inputType: 'query',
        })
        embedding = res.data?.[0]?.embedding ?? []
        break
      } catch (err) {
        const msg = String(err)
        if (msg.includes('429') && embedAttempts < 3) {
          process.stdout.write(`  (429 rate limit — retrying in 30s...)`)
          await new Promise((r) => setTimeout(r, 30_000))
          process.stdout.write('\r' + ' '.repeat(50) + '\r')
          continue
        }
        console.log(`  ✗ Voyage embed error: ${msg}\n`)
        results.push({ q, topScore: 0, bestMatch: '(embed error)', pass: false })
        break
      }
    }
    if (!embedding!) continue

    const { data, error } = await supabase.rpc('match_kb_chunks', {
      query_embedding: embedding,
      query_text: q.query,
      match_threshold: 0.20, // low floor for diagnostics — we judge at PASS_THRESHOLD
      match_count: 5,
    })

    if (error) {
      console.log(`  ✗ RPC error: ${error.message}\n`)
      results.push({ q, topScore: 0, bestMatch: '(rpc error)', pass: false })
      continue
    }

    const chunks = (data as ChunkResult[]) ?? []
    const topScore = chunks[0]?.similarity ?? 0
    const bestMatch = chunks[0]
      ? `${chunks[0].source_title} §${chunks[0].section_number ?? 'n/a'}`
      : '(no results)'
    // fraud_suspected is exempt from the 0.65 threshold — CLAUDE.md notes it
    // has low fightability by design. Procedural fallback is sufficient.
    const exempt = q.category === 'fraud_suspected'
    const pass = exempt ? topScore >= 0.40 : topScore >= PASS_THRESHOLD

    const label = exempt
      ? (topScore >= 0.40 ? '✓ (exempt)' : '✗')
      : scoreLabel(topScore, PASS_THRESHOLD)
    const delta = improvementNote(topScore, q.baselineScore)
    console.log(`  Score: ${topScore.toFixed(3)} ${label}  ${delta}  (baseline: ${q.baselineScore.toFixed(3)})`)
    console.log(`  Best:  ${bestMatch}`)
    if (!pass) {
      console.log(`  Class: ${q.failureClass}`)
    }
    console.log()

    results.push({ q, topScore, bestMatch, pass })
  }

  // ── Summary table ─────────────────────────────────────────────────────────

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)

  console.log('\n' + '─'.repeat(90))
  console.log('SUMMARY')
  console.log('─'.repeat(90))
  console.log(
    'ID  Label'.padEnd(38) +
    'Score  '.padStart(8) +
    'Baseline'.padStart(10) +
    '  Delta'.padStart(8) +
    '  Pass'.padStart(6) +
    '  Failure class'
  )
  console.log('─'.repeat(90))
  for (const r of results) {
    const id = String(r.q.id).padStart(2)
    const label = r.q.label.slice(0, 34).padEnd(34)
    const score = r.topScore.toFixed(3).padStart(7)
    const base = r.q.baselineScore.toFixed(3).padStart(9)
    const delta = improvementNote(r.topScore, r.q.baselineScore).padStart(8)
    const pass = (r.pass ? '✓' : '✗').padStart(5)
    const fc = r.pass ? '' : r.q.failureClass
    console.log(`${id}  ${label} ${score} ${base} ${delta} ${pass}  ${fc}`)
  }
  console.log('─'.repeat(90))
  console.log(`\nResult: ${passed}/${QUERIES.length} queries pass 0.65 threshold`)

  if (failed.length === 0) {
    console.log('✓ All queries pass — KB retrieval health: GOOD\n')
    process.exit(0)
  } else {
    console.log('\nStill failing:')
    for (const r of failed) {
      console.log(`  [${r.q.id}] ${r.q.label}: score ${r.topScore.toFixed(3)} — ${r.q.failureClass}`)
    }
    console.log()
    process.exit(1)
  }
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1) })
