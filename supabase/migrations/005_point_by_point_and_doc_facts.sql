-- Migration 005: Add point-by-point analysis + per-doc structured facts
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New query -> paste -> Run).
-- Idempotent: safe to run multiple times.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS point_by_point_analysis JSONB;

ALTER TABLE case_documents
  ADD COLUMN IF NOT EXISTS extracted_facts JSONB;

-- point_by_point_analysis: array of strings (case-specific sentences for Screen 3).
--   First 2-3 shown unblurred, rest behind the paywall blur.
-- extracted_facts: per-doc structured summary keyed by doc_type
--   (see types/case.ts SupportingDocFacts).
