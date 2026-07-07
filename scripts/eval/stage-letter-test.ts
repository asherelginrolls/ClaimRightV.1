// Stage-letter eval (Phase 5 gate): the SAME golden bursitis facts pushed
// through the Bima Bharosa and Ombudsman stage framings. Proves stage letters
// keep the citation bar: real citations only, no must_not_say inversion, the
// stage-appropriate addressee, and post-payment hard minimums.
//
// Usage: npx tsx --env-file=.env.local scripts/eval/stage-letter-test.ts

import fs from 'fs'
import path from 'path'
import { runReasoning } from '../../lib/reasoning'
import { generateLetterFromAngles, flattenLetter } from '../../lib/generation'
import { getStageFraming } from '../../prompts/stage-framings'
import type { DisputeStage } from '../../lib/deadlines'

interface GoldenCaseFile {
  cases: Array<{
    id: string
    facts: {
      insurer: string | null
      claim_amount: number | null
      rejection_date: string | null
      rejection_reason_raw: string | null
      rejection_reason_category: string
      documents_requested_count: number | null
      policy_age_months: number | null
    }
    extra_context: { primary_diagnosis?: string; narrative: string }
    must_not_say: Array<{ id: string; patterns: string[] }>
  }>
}

async function main() {
  const raw = fs.readFileSync(path.join(__dirname, 'golden-cases.json'), 'utf8')
  const golden = (JSON.parse(raw) as GoldenCaseFile).cases.find(
    (c) => c.id === 'bursitis-star-health'
  )
  if (!golden) throw new Error('bursitis golden case not found')

  const stages: Array<{ stage: DisputeStage; expectHeader: RegExp; priorContext: string }> = [
    {
      stage: 'bima_bharosa',
      expectHeader: /Bima Bharosa/i,
      priorContext:
        'Previous stage: Grievance Officer (GRO) — status "escalated", filed 2026-02-20. The insurer did not respond within 15 days.\n\nDirective: the earlier stage’s verified arguments still hold — keep them as the core frame, re-aimed at the new authority.',
    },
    {
      stage: 'ombudsman',
      expectHeader: /Insurance Ombudsman/i,
      priorContext:
        'Previous stage: Bima Bharosa (IRDAI portal) — status "escalated", filed 2026-03-15. New document since the previous stage (type: prior_correspondence) — extracted text:\nThe insurer reiterated its repudiation under Excl.02 F, asserting the 24-month specified-disease waiting period applies to trochanteric bursitis, and offered no response on the delay in claim decision.\n\nDirective: rebuild the argument set from scratch for this stage; address every new point the insurer has raised.',
    },
  ]

  let failures = 0
  for (const { stage, expectHeader, priorContext } of stages) {
    console.log(`\n━━ stage: ${stage}`)
    const reasoning = await runReasoning({
      insurer: golden.facts.insurer,
      claimAmountRupees:
        golden.facts.claim_amount != null ? Math.round(golden.facts.claim_amount / 100) : null,
      rejectionDate: golden.facts.rejection_date,
      rejectionReasonRaw: golden.facts.rejection_reason_raw,
      category: golden.facts.rejection_reason_category,
      documentsRequestedCount: golden.facts.documents_requested_count,
      policyAgeMonths: golden.facts.policy_age_months,
      primaryDiagnosis: golden.extra_context.primary_diagnosis ?? null,
      extraContext: golden.extra_context.narrative,
      priorStageContext: priorContext,
    })

    const letter = await generateLetterFromAngles(
      {
        insurer: golden.facts.insurer ?? 'the insurer',
        claimAmount: golden.facts.claim_amount ?? 0,
        rejectionReasonRaw: golden.facts.rejection_reason_raw ?? '',
        rejectionReasonCategory: 'waiting_period',
        rejectionDate: golden.facts.rejection_date,
      },
      reasoning,
      getStageFraming(stage)
    )
    const text = flattenLetter(letter)

    const checks: Array<{ name: string; ok: boolean; detail?: string }> = []

    checks.push({
      name: 'stage-appropriate addressee/header',
      ok: expectHeader.test(text),
    })

    const words = text.split(/\s+/).filter(Boolean).length
    checks.push({ name: `≥400 words (got ${words})`, ok: words >= 400 })

    const validCitations = letter.paragraphs.reduce(
      (acc, p) => acc + p.citations.filter((c) => c.status !== 'fail').length,
      0
    )
    checks.push({ name: `≥3 valid citations (got ${validCitations})`, ok: validCitations >= 3 })

    checks.push({
      name: 'zero hallucinated chunk_ids survived',
      ok: letter.paragraphs.every((p) => !p.hasRemovedClaims),
      detail: 'hasRemovedClaims flags indicate a fabricated citation was caught (removal working) — but the final letter must not need them',
    })

    for (const m of golden.must_not_say) {
      const violated = m.patterns.find((p) => new RegExp(p, 'i').test(text))
      checks.push({
        name: `must_not_say ${m.id}`,
        ok: !violated,
        detail: violated ? `matched: ${violated}` : undefined,
      })
    }

    for (const c of checks) {
      console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${!c.ok && c.detail ? ` — ${c.detail}` : ''}`)
      if (!c.ok) failures++
    }
  }

  console.log(`\n${failures === 0 ? 'ALL STAGE-LETTER CHECKS PASS' : `${failures} check(s) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
