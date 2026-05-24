import type { ExtractedFacts } from '@/types/api'
import type { RetrievalResult } from '@/lib/retrieval'
import type { FightabilityScore, FightabilityReason, RejectionCategory } from '@/types/case'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Compute a numeric fightability score (0–100) per CLAUDE_PART2 §3.
 * policyAgeMonths is required to apply the pre_existing_condition_post_60mo bonus.
 */
export function computeNumericScore(
  retrieval: RetrievalResult,
  category: RejectionCategory,
  policyAgeMonths: number | null = null
): number {
  const base = Math.floor(retrieval.topScore * 100)

  const categoryBonusMap: Record<string, number> = {
    documentation_incomplete: 20,
    cashless_denial: 18,
    experimental_treatment: 8,
    waiting_period: 12,
    other: 0,
    policy_exclusion: 0,
    non_disclosure: 0,
    fraud_suspected: 0,
    pre_existing_condition: 0,
  }

  let categoryBonus = categoryBonusMap[category] ?? 0

  // pre_existing_condition_post_60mo: only applies if moratorium passed
  if (category === 'pre_existing_condition' && policyAgeMonths !== null && policyAgeMonths >= 60) {
    categoryBonus = 15
  }

  // Cap bonus at +20
  categoryBonus = Math.min(categoryBonus, 20)

  let penalty = 0
  if (category === 'fraud_suspected') penalty -= 40
  if (retrieval.chunks.length === 0) penalty -= 10 // kb_miss_count > 0

  return clamp(base + categoryBonus + penalty, 5, 95)
}

function buildCitation(chunk: { source_title: string; section_number: string | null }): string {
  return chunk.section_number
    ? `${chunk.source_title}, §${chunk.section_number}`
    : chunk.source_title
}

export function calculateFightabilityScore(
  facts: ExtractedFacts,
  retrieval: RetrievalResult
): { score: FightabilityScore; reasons: FightabilityReason[] } {
  const { chunks, topScore } = retrieval
  const category = facts.rejection_reason_category

  // ── STRONG conditions (any one is sufficient) ───────────────────────────────

  const strongReasons: FightabilityReason[] = []

  if (topScore >= 0.80 && chunks.length > 0) {
    strongReasons.push({
      reason: `A directly applicable IRDAI regulation was found that supports your dispute (match confidence: ${Math.round(topScore * 100)}%).`,
      citation: buildCitation(chunks[0]),
    })
  }

  if (facts.documents_requested_count !== null && facts.documents_requested_count >= 2) {
    strongReasons.push({
      reason: `Your insurer sent ${facts.documents_requested_count} separate document requests for the same claim — a practice explicitly prohibited by the IRDAI Master Circular on Health Insurance.`,
      citation: 'IRDAI Master Circular on Health Insurance (29.05.2024)',
    })
  }

  if (category === 'documentation_incomplete') {
    strongReasons.push({
      reason: 'Claims rejected for incomplete documentation are overwhelmingly overturned at the ombudsman stage. IRDAI rules prohibit piecemeal document requests.',
      citation: 'IRDAI Master Circular on Health Insurance (29.05.2024)',
    })
  }

  if (
    category === 'pre_existing_condition' &&
    facts.policy_age_months !== null &&
    facts.policy_age_months >= 60
  ) {
    strongReasons.push({
      reason: `Your policy is over 60 months old. Under the PPOI Master Circular (05.09.2024), insurers cannot reject claims on pre-existing disease grounds after the 60-month moratorium period has elapsed.`,
      citation: 'PPOI Master Circular (05.09.2024), §3 — 60-Month Moratorium on Pre-Existing Disease',
    })
  }

  if (category === 'cashless_denial') {
    strongReasons.push({
      reason: 'IRDAI mandates cashless pre-authorization decisions within 1 hour (pre-procedure) or 3 hours (discharge). Delays or denials without timely response are grounds for dispute.',
      citation: 'IRDAI Master Circular on Health Insurance (29.05.2024), §5',
    })
  }

  if (strongReasons.length > 0) {
    return {
      score: 'strong',
      reasons: strongReasons.slice(0, 3),
    }
  }

  // ── MEDIUM conditions (any one is sufficient) ────────────────────────────────

  const mediumReasons: FightabilityReason[] = []

  if (topScore >= 0.65 && topScore < 0.80 && chunks.length > 0) {
    mediumReasons.push({
      reason: `A potentially applicable IRDAI regulation was found that may support your dispute (match confidence: ${Math.round(topScore * 100)}%).`,
      citation: buildCitation(chunks[0]),
    })
  }

  if (category === 'waiting_period') {
    mediumReasons.push({
      reason: 'Waiting period rejections can be disputed if the waiting period has elapsed or if the condition is unrelated to a listed exclusion.',
      citation: null,
    })
  }

  // Any tier-2 (precedent) chunk found for this rejection type
  const precedentChunk = chunks.find((c) => c.tier === 2)
  if (precedentChunk) {
    mediumReasons.push({
      reason: 'A relevant ombudsman precedent was found for a similar rejection. Past awards can be cited in your dispute letter.',
      citation: buildCitation(precedentChunk),
    })
  }

  if (mediumReasons.length > 0) {
    return {
      score: 'medium',
      reasons: mediumReasons.slice(0, 3),
    }
  }

  // ── LOW (default) ────────────────────────────────────────────────────────────

  const lowReason: FightabilityReason =
    category === 'fraud_suspected'
      ? {
          reason: 'Claims rejected on fraud grounds require specialist legal advice and are outside the scope of standard dispute letters.',
          citation: null,
        }
      : {
          reason: 'No directly applicable regulation or precedent was found for this rejection. Consider consulting an insurance advisor.',
          citation: null,
        }

  return {
    score: 'low',
    reasons: [lowReason],
  }
}
