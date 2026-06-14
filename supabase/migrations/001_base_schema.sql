-- 001_base_schema.sql
--
-- BASE SCHEMA for ClaimRight (cases, kb_chunks, hybrid-search RPC).
--
-- The live/production database was originally hand-built via the Supabase SQL
-- editor, so the migrations directory historically started at 002 and every
-- later migration (002 case_documents → 006 generating_status, 007 retrieval
-- threshold) assumed these objects already existed. On a fresh database — e.g.
-- a Supabase preview-branch — the chain failed at 002 with:
--   ERROR: relation "cases" does not exist (SQLSTATE 42P01)
-- because nothing created the base. This migration backfills that base so the
-- full chain applies cleanly from scratch.
--
-- This file intentionally reproduces the ORIGINAL schema (from CLAUDE.md), i.e.
-- BEFORE the later migrations evolve it:
--   * 003 adds cases.fightability_numeric + cases.evidence_summaries
--   * 005 adds cases.point_by_point_analysis (+ case_documents.extracted_facts)
--   * 006 swaps cases_status_check to include 'generating'
--   * 007 replaces match_kb_chunks (COALESCE(ts_rank,...), DEFAULT 0.55)
-- so those columns/constraints/bodies are deliberately NOT present here — the
-- later migrations add them on top.
--
-- Idempotent (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS) so it is safe
-- to run against a database that already contains some of these objects.

-- pgvector for embedding similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- ── cases ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT,
  status TEXT CHECK (status IN ('uploaded', 'analysed', 'paid', 'generated', 'delivered')) DEFAULT 'uploaded',
  insurer TEXT,
  claim_amount INTEGER, -- stored in paise (1 rupee = 100 paise)
  rejection_reason_raw TEXT,
  rejection_reason_category TEXT CHECK (rejection_reason_category IN (
    'pre_existing_condition', 'policy_exclusion', 'documentation_incomplete',
    'non_disclosure', 'waiting_period', 'cashless_denial',
    'experimental_treatment', 'fraud_suspected', 'other'
  )),
  rejection_date DATE,
  fightability_score TEXT CHECK (fightability_score IN ('low', 'medium', 'strong')),
  fightability_reasons JSONB, -- array of {reason: string, citation: string|null}
  document_path TEXT, -- Supabase Storage path
  letter_path TEXT, -- path to generated dispute letter PDF
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  paid_at TIMESTAMPTZ
);

-- ── kb_chunks ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tier INTEGER CHECK (tier IN (1, 2, 3)),
  source_title TEXT NOT NULL,
  section_number TEXT,
  date DATE,
  circular_number TEXT,
  issuer TEXT NOT NULL, -- e.g. "IRDAI", "Insurance Ombudsman", "NCDRC"
  url TEXT,
  content TEXT NOT NULL, -- the chunk text (~400 tokens)
  embedding VECTOR(1024), -- voyage-law-2 outputs 1024 dimensions
  fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

-- HNSW index for fast vector search + GIN index for full-text search
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_hnsw_idx ON kb_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS kb_chunks_fts_gin_idx ON kb_chunks USING gin (fts);

-- ── Hybrid search RPC (PostgREST cannot run pgvector operators directly) ─────
-- Original definition; 007 later replaces it (COALESCE(ts_rank,...), DEFAULT 0.55).
CREATE OR REPLACE FUNCTION match_kb_chunks(
  query_embedding VECTOR(1024),
  query_text TEXT,
  match_threshold FLOAT DEFAULT 0.65,
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
    -- Hybrid score: 70% vector similarity + 30% BM25-style full-text
    (0.7 * (1 - (kc.embedding <=> query_embedding))) +
    (0.3 * ts_rank(kc.fts, plainto_tsquery('english', query_text))) AS similarity
  FROM kb_chunks kc
  WHERE
    (1 - (kc.embedding <=> query_embedding)) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- ── Row Level Security ──────────────────────────────────────────────────────
-- All server access uses the service-role client (which bypasses RLS). KB is
-- publicly readable; everything else is service-role only.
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cases_service_role_only" ON cases;
CREATE POLICY "cases_service_role_only" ON cases
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "kb_chunks_public_read" ON kb_chunks;
CREATE POLICY "kb_chunks_public_read" ON kb_chunks
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "kb_chunks_service_role_write" ON kb_chunks;
CREATE POLICY "kb_chunks_service_role_write" ON kb_chunks
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Table grants (RLS gates row visibility; PostgREST roles still need table privileges).
GRANT SELECT, INSERT, UPDATE, DELETE ON cases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON cases TO authenticated;
GRANT SELECT ON kb_chunks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_chunks TO service_role;
