/**
 * Centralised threshold constants for Ashray's anti-hallucination pipeline.
 * Change values here — they propagate to scoring, generation, and retrieval.
 *
 * CLAUDE.md §6 — retrieve at 0.55, gate at 0.65. The gating floor of 0.65 is
 * a hard invariant and must never be lowered.
 */

/** Floor passed to the match_kb_chunks RPC. Lowered from 0.65 → 0.55 so
 *  genuinely-relevant chunks scoring [0.55, 0.65) still reach the reranker. */
export const RETRIEVAL_THRESHOLD = 0.55

/** Floor a chunk must clear before it may, ON ITS OWN, justify a pre-payment
 *  fightability claim or citation. A [0.55, 0.65) chunk may inform retrieval
 *  and reranking but must NOT by itself produce a pre-payment legal claim. */
export const GATING_FLOOR = 0.65

/** Similarity at which a KB match triggers the STRONG fightability band. */
export const STRONG_MATCH_THRESHOLD = 0.8

/** Token-overlap coefficient at or above which a citation PASSES span validation. */
export const SPAN_PASS_THRESHOLD = 0.7

/** Token-overlap coefficient at or above which a citation is FLAGGED (language
 *  softened). Below this is a FAIL. */
export const SPAN_FLAG_THRESHOLD = 0.4

/** Relaxed retrieval threshold used post-payment when the primary retrieval
 *  returns no chunks above GATING_FLOOR. Ensures we always have anchor chunks
 *  for the generation step (post-payment must deliver a complete letter). */
export const POST_PAYMENT_FALLBACK_THRESHOLD = 0.4
