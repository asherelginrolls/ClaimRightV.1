export type KbTier = 1 | 2 | 3

export interface KbChunk {
  id: string
  created_at: string
  tier: KbTier
  source_title: string
  section_number: string | null
  date: string | null
  circular_number: string | null
  issuer: string
  url: string | null
  content: string
  embedding: number[] | null
}

export interface KbSearchResult {
  id: string
  content: string
  source_title: string
  section_number: string | null
  circular_number: string | null
  issuer: string
  url: string | null
  tier: KbTier
  similarity: number
}
