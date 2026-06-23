import type { ExtractedFacts } from '@/types/api'
import { GATING_FLOOR, type RetrievalResult } from '@/lib/retrieval'
import type { FightabilityScore, FightabilityReason, RejectionCategory } from '@/types/case'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Compute a numeric fightability score (0–100) that is always consistent with
 * the text band from calculateFightabilityScore.
 *
 * Band ranges:
 *   strong  → 65–95  (center 80)
 *   medium  → 40–64  (center 52)
 *   low     → 5–39   (center 22)
 *
 * Retrieval quality (topScore) refines the position within the band.
 * When there are no KB chunks, the score sits at the bottom of the band.
 */
export function computeNumericScore(
  retrieval: RetrievalResult,
  textBand: FightabilityScore = 'low'
): number {
  const [bandMin, bandCenter, bandMax] =
    textBand === 'strong' ? [65, 80, 95] :
    textBand === 'medium' ? [40, 52, 64] :
                            [5,  22, 39]

  // retrievalQuality: -1 (no chunks) → +1 (topScore = 1.0)
  // Normalised over the meaningful GATING_FLOOR–1.0 range; below the gating floor
  // treated as –1 (a sub-floor chunk does not lift the pre-payment score).
  const topScore = retrieval.topScore
  const retrievalQuality =
    topScore > 0
      ? clamp((topScore - GATING_FLOOR) / (1 - GATING_FLOOR), -1, 1)
      : -1

  // Shift the center by up to 70% of the half-band width in each direction.
  const halfRange = bandMax - bandCenter
  const score = bandCenter + Math.round(retrievalQuality * halfRange * 0.7)
  return clamp(score, bandMin, bandMax)
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

  if (topScore >= GATING_FLOOR && topScore < 0.80 && chunks.length > 0) {
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

  // Any tier-2 (precedent) chunk found for this rejection type.
  // Must clear GATING_FLOOR (0.65): retrieval now surfaces [0.55, 0.65) chunks for
  // reranking (CLAUDE_PART2.md §6), but a sub-floor precedent must NOT, on its own,
  // justify a pre-payment fightability claim/citation.
  const precedentChunk = chunks.find((c) => c.tier === 2 && c.similarity >= GATING_FLOOR)
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

// ─────────────────────────────────────────────────────────────────────────────
// SCORER STRATEGY INTERFACE (CLAUDE_PART2 scoring-evolution foundation)
//
// We currently have ZERO outcome labels, so training a model is premature
// (CLAUDE.md: "bottoms-up, never estimate"). Instead we make scoring *swappable*
// and *measurable* without changing any user-facing behavior:
//
//   • RuleBasedScorer below is a thin wrapper over the EXACT same
//     calculateFightabilityScore + computeNumericScore above. It stays the
//     production default — output is byte-for-byte identical to V1.
//   • It additionally emits a flat, typed `features` vector — the precise input
//     a future learned Scorer would consume. /api/analyse persists this on every
//     case so a labeled dataset accumulates at zero marginal cost.
//
// A model is only justified once scripts/scoring-report.ts shows enough labeled
// cases per band. Until then, RuleBasedScorer is in charge.
// ─────────────────────────────────────────────────────────────────────────────

const REJECTION_CATEGORIES: readonly RejectionCategory[] = [
  'pre_existing_condition',
  'policy_exclusion',
  'documentation_incomplete',
  'non_disclosure',
  'waiting_period',
  'cashless_denial',
  'experimental_treatment',
  'fraud_suspected',
  'other',
]

/**
 * Flat, typed feature vector capturing every signal the rules engine uses.
 * Numeric `-1` is the explicit "unknown / not provided" sentinel for the two
 * optional integer inputs (documents_requested_count, policy_age_months) and
 * days_since_rejection; paired booleans expose the thresholds the rules apply.
 * This is the exact vector a future learned Scorer will consume.
 */
export interface ScoringFeatures {
  topScore: number
  chunkCount: number
  topScoreAboveGatingFloor: boolean
  documentsRequestedCount: number
  documentsRequestedMultiple: boolean
  policyAgeMonths: number
  policyAgeOver60: boolean
  daysSinceRejection: number
  tier2PrecedentFound: boolean
  // category one-hots
  cat_pre_existing_condition: boolean
  cat_policy_exclusion: boolean
  cat_documentation_incomplete: boolean
  cat_non_disclosure: boolean
  cat_waiting_period: boolean
  cat_cashless_denial: boolean
  cat_experimental_treatment: boolean
  cat_fraud_suspected: boolean
  cat_other: boolean
}

export interface ScorerOutput {
  score: FightabilityScore
  reasons: FightabilityReason[]
  numeric: number
  features: ScoringFeatures
}

export interface Scorer {
  /** Persisted on each case as `scorer_version` so outcomes are attributable. */
  readonly version: string
  score(facts: ExtractedFacts, retrieval: RetrievalResult): ScorerOutput
}

/** Whole days between rejection_date and `now`; -1 when unknown/unparseable. */
export function daysSinceRejection(rejectionDate: string | null, now: Date = new Date()): number {
  if (!rejectionDate) return -1
  const then = new Date(rejectionDate)
  if (Number.isNaN(then.getTime())) return -1
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000)
  return days >= 0 ? days : -1
}

export function buildScoringFeatures(
  facts: ExtractedFacts,
  retrieval: RetrievalResult,
  now: Date = new Date()
): ScoringFeatures {
  const category = facts.rejection_reason_category
  const docCount = facts.documents_requested_count ?? -1
  const policyAge = facts.policy_age_months ?? -1
  const oneHot = (c: RejectionCategory): boolean => category === c

  return {
    topScore: retrieval.topScore,
    chunkCount: retrieval.chunks.length,
    topScoreAboveGatingFloor: retrieval.topScore >= GATING_FLOOR,
    documentsRequestedCount: docCount,
    documentsRequestedMultiple: docCount >= 2,
    policyAgeMonths: policyAge,
    policyAgeOver60: policyAge >= 60,
    daysSinceRejection: daysSinceRejection(facts.rejection_date, now),
    tier2PrecedentFound: retrieval.chunks.some((c) => c.tier === 2 && c.similarity >= GATING_FLOOR),
    cat_pre_existing_condition: oneHot('pre_existing_condition'),
    cat_policy_exclusion: oneHot('policy_exclusion'),
    cat_documentation_incomplete: oneHot('documentation_incomplete'),
    cat_non_disclosure: oneHot('non_disclosure'),
    cat_waiting_period: oneHot('waiting_period'),
    cat_cashless_denial: oneHot('cashless_denial'),
    cat_experimental_treatment: oneHot('experimental_treatment'),
    cat_fraud_suspected: oneHot('fraud_suspected'),
    cat_other: oneHot('other'),
  }
}

/**
 * The current production scorer. Delegates verbatim to the V1 rules functions
 * so behavior is unchanged; adds the feature vector for dataset capture.
 */
export class RuleBasedScorer implements Scorer {
  readonly version = 'rules-v1'

  score(facts: ExtractedFacts, retrieval: RetrievalResult): ScorerOutput {
    const { score, reasons } = calculateFightabilityScore(facts, retrieval)
    const numeric = computeNumericScore(retrieval, score)
    const features = buildScoringFeatures(facts, retrieval)
    return { score, reasons, numeric, features }
  }
}

// Single shared default — swap this binding (not the call sites) when a learned
// Scorer is eventually justified by scripts/scoring-report.ts calibration data.
export const defaultScorer: Scorer = new RuleBasedScorer()

// Keep REJECTION_CATEGORIES referenced (it documents the canonical one-hot order
// for downstream model tooling and guards against the enum drifting).
export const SCORING_CATEGORY_ORDER = REJECTION_CATEGORIES
