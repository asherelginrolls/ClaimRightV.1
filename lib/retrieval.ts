import { createServiceClient } from '@/lib/supabase'
import { embedText } from '@/lib/voyage'
import type { KbSearchResult } from '@/types/kb'
import { expandQueryWithSynonyms } from '@/lib/synonyms'

// Re-export so callers that previously imported from here still work
export { expandQueryWithSynonyms }

export interface RetrievalResult {
  chunks: KbSearchResult[]
  queryEmbedding: number[]
  topScore: number
}

// CLAUDE_PART2.md §6 — retrieve at 0.55, gate at 0.65.
//
// RETRIEVAL_THRESHOLD: the floor passed to the match_kb_chunks RPC. Lowered from
// 0.65 → 0.55 so genuinely-relevant chunks scoring [0.55, 0.65) still reach the
// reranker (they were previously dropped at retrieval time, hurting recall).
//
// GATING_FLOOR: the floor a chunk must clear before it may, ON ITS OWN, justify a
// pre-payment fightability claim or citation. A [0.55, 0.65) chunk may inform
// retrieval/reranking but must NOT by itself produce a pre-payment legal claim.
// (Post-payment gating is governed by §1 in lib/generation.ts, not by this floor.)
export const RETRIEVAL_THRESHOLD = 0.55
export const GATING_FLOOR = 0.65

type MatchKbChunksArgs = {
  query_embedding: number[]
  query_text: string
  match_threshold?: number
  match_count?: number
}

export async function retrieveChunks(
  query: string,
  options: {
    matchThreshold?: number
    matchCount?: number
  } = {}
): Promise<RetrievalResult> {
  // Default to RETRIEVAL_THRESHOLD (0.55) so [0.55, 0.65) chunks reach the
  // reranker — see CLAUDE_PART2.md §6. Pre-payment gating against GATING_FLOOR
  // (0.65) is enforced by the consumers in lib/scoring.ts, NOT here.
  const { matchThreshold = RETRIEVAL_THRESHOLD, matchCount = 10 } = options

  const queryEmbedding = await embedText(query, 'query')

  const supabase = createServiceClient()

  // PostgREST doesn't support pgvector operators directly — must use rpc()
  // Type cast needed due to supabase-js generic resolution with custom Database types
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: 'match_kb_chunks',
      args: MatchKbChunksArgs
    ) => Promise<{ data: KbSearchResult[] | null; error: { message: string } | null }>
  )('match_kb_chunks', {
    query_embedding: queryEmbedding,
    query_text: query,
    match_threshold: matchThreshold,
    match_count: matchCount,
  })

  if (error) throw new Error(`KB retrieval failed: ${error.message}`)

  const results = data ?? []

  // Re-rank: boost Tier 1 chunks by 0.05, return top 3
  const reranked = results
    .map((r) => ({ ...r, rerankedScore: r.similarity + (r.tier === 1 ? 0.05 : 0) }))
    .sort((a, b) => b.rerankedScore - a.rerankedScore)
    .slice(0, 3)

  const topScore = reranked[0]?.similarity ?? 0

  return { chunks: reranked, queryEmbedding, topScore }
}

export async function retrieveForCase(extractedFacts: {
  insurerName: string | null
  rejectionReasonRaw: string | null
  rejectionReasonCategory: string | null
  claimAmount: number | null
  policyAgeMonths?: number | null
  primaryDiagnosis?: string | null
}): Promise<RetrievalResult> {
  const queryParts = [
    extractedFacts.rejectionReasonRaw,
    extractedFacts.insurerName ? `insurer: ${extractedFacts.insurerName}` : null,
    extractedFacts.rejectionReasonCategory
      ? `rejection category: ${extractedFacts.rejectionReasonCategory.replace(/_/g, ' ')}`
      : null,
    extractedFacts.policyAgeMonths != null
      ? `policy age ${extractedFacts.policyAgeMonths} months${extractedFacts.policyAgeMonths >= 60 ? ' (moratorium passed)' : ''}`
      : null,
    extractedFacts.primaryDiagnosis ? `diagnosis: ${extractedFacts.primaryDiagnosis}` : null,
    'IRDAI regulation health insurance India',
  ].filter((p): p is string => p !== null)

  const rawQuery = queryParts.join('. ')
  const query = expandQueryWithSynonyms(rawQuery)
  return retrieveChunks(query)
}
