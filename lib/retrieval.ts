import { createServiceClient } from '@/lib/supabase'
import { embedText } from '@/lib/voyage'
import type { KbSearchResult } from '@/types/kb'

export interface RetrievalResult {
  chunks: KbSearchResult[]
  queryEmbedding: number[]
  topScore: number
}

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
  const { matchThreshold = 0.65, matchCount = 10 } = options

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

  const query = queryParts.join('. ')
  return retrieveChunks(query)
}
