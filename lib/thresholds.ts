/**
 * Centralised threshold constants for ClaimRight's anti-hallucination pipeline.
 * Change values here — they propagate to scoring, generation, and retrieval.
 */

/** Minimum similarity for a KB chunk to count toward pre-payment scoring/gating. */
export const RETRIEVAL_MIN_THRESHOLD = 0.65

/** Similarity at which a KB match triggers the STRONG fightability band. */
export const STRONG_MATCH_THRESHOLD = 0.80

/** Token-overlap coefficient at or above which a citation PASSES span validation. */
export const SPAN_PASS_THRESHOLD = 0.70

/** Token-overlap coefficient at or above which a citation is FLAGGED (language softened).
 *  Below this is a FAIL. */
export const SPAN_FLAG_THRESHOLD = 0.40

/** Relaxed retrieval threshold used post-payment when the primary retrieval returns
 *  no chunks above RETRIEVAL_MIN_THRESHOLD. Ensures we always have anchor chunks for
 *  the generation step (CLAUDE_PART2.md §1). */
export const POST_PAYMENT_FALLBACK_THRESHOLD = 0.40
