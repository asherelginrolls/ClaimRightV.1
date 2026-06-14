-- 007_lower_retrieval_threshold.sql
--
-- CLAUDE_PART2.md §6 — RETRIEVAL QUALITY UPGRADE.
-- Lower the match_kb_chunks DEFAULT match_threshold from 0.65 -> 0.55 so the
-- reranker sees genuinely-relevant chunks scoring [0.55, 0.65) that were
-- previously dropped at retrieval time (hurting recall).
--
-- This only changes the *retrieval* floor. The pre-payment *gating* floor stays
-- at 0.65 and is enforced in TypeScript (lib/retrieval.ts GATING_FLOOR, consumed
-- by lib/scoring.ts): a chunk below 0.65 may inform retrieval/reranking but must
-- NOT, on its own, justify a pre-payment fightability claim or citation.
-- Post-payment gating is governed by CLAUDE_PART2.md §1, not by this threshold.
--
-- Production callers in lib/retrieval.ts always pass match_threshold explicitly
-- (RETRIEVAL_THRESHOLD = 0.55); this DEFAULT change keeps the DB in sync with the
-- code so the two cannot silently diverge.
--
-- The function body below is reproduced verbatim from the live database (which
-- wraps ts_rank in COALESCE(..., 0) to guard against null FTS ranks). The ONLY
-- change vs. the deployed definition is match_threshold DEFAULT 0.65 -> 0.55.

CREATE OR REPLACE FUNCTION match_kb_chunks(
  query_embedding VECTOR(1024),
  query_text TEXT,
  match_threshold FLOAT DEFAULT 0.55,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_title TEXT,
  section_number TEXT,
  circular_number TEXT,
  issuer TEXT,
  url TEXT,
  tier INTEGER,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    kc.id,
    kc.content,
    kc.source_title,
    kc.section_number,
    kc.circular_number,
    kc.issuer,
    kc.url,
    kc.tier,
    -- Hybrid score: 70% vector similarity + 30% BM25-style full-text (unchanged)
    (0.7 * (1 - (kc.embedding <=> query_embedding))) +
    (0.3 * COALESCE(ts_rank(kc.fts, plainto_tsquery('english', query_text)), 0)) AS similarity
  FROM kb_chunks kc
  WHERE
    (1 - (kc.embedding <=> query_embedding)) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
