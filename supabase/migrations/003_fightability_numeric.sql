-- Migration 003: Add numeric fightability score and evidence summaries
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run)
-- DO NOT run this if columns already exist.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS fightability_numeric INTEGER,
  ADD COLUMN IF NOT EXISTS evidence_summaries JSONB;

-- fightability_numeric: 0–100 derived score (see lib/scoring.ts computeNumericScore)
-- evidence_summaries: array of { source_title, section_number, tier, similarity, explainer }
--   one entry per top-3 retrieved KB chunk, explainer is a 1-line plain-English summary
