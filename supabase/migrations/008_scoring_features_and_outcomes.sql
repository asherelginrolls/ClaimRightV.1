-- 008_scoring_features_and_outcomes.sql
--
-- SCORING EVOLUTION — DATA FOUNDATION (CLAUDE_PART2 scoring-evolution session).
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query →
-- paste → Run). Idempotent: safe to run multiple times. Asher applies
-- migrations himself; this file is NOT auto-run.
--
-- We have ZERO outcome labels today, so we do NOT train a model. Instead we
-- capture, on every scored case, (a) the exact feature vector the rules used and
-- (b) the band/number we showed the user — then add a place to record the REAL
-- dispute outcome later. Over time this becomes the labeled dataset that tells
-- us (via scripts/scoring-report.ts) WHEN a learned scorer is justified.
--
-- All columns are nullable / defaulted so this is fully backwards-compatible
-- with existing rows and the existing /api/analyse + /api/generate flow.
--
-- RLS: `cases` already has RLS enabled with the "cases_service_role_only" policy
-- (migration 001). Adding columns does not change row visibility; all writes
-- here go through the service-role client, consistent with every other migration.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS features JSONB,                 -- ScoringFeatures vector at scoring time
  ADD COLUMN IF NOT EXISTS predicted_score TEXT,           -- band shown to the user ('low'|'medium'|'strong')
  ADD COLUMN IF NOT EXISTS predicted_numeric INTEGER,      -- 0–100 numeric shown to the user
  ADD COLUMN IF NOT EXISTS scorer_version TEXT,            -- e.g. 'rules-v1'
  ADD COLUMN IF NOT EXISTS outcome TEXT DEFAULT 'unknown', -- real dispute result (label)
  ADD COLUMN IF NOT EXISTS outcome_stage TEXT,             -- 'gro'|'igms'|'ombudsman'|'court'
  ADD COLUMN IF NOT EXISTS outcome_recorded_at TIMESTAMPTZ;

-- Constrain the label vocabulary (drop/add so re-runs stay idempotent).
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_outcome_check;
ALTER TABLE cases ADD CONSTRAINT cases_outcome_check
  CHECK (outcome IN ('won', 'partial', 'lost', 'withdrawn', 'unknown'));

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_outcome_stage_check;
ALTER TABLE cases ADD CONSTRAINT cases_outcome_stage_check
  CHECK (outcome_stage IS NULL OR outcome_stage IN ('gro', 'igms', 'ombudsman', 'court'));

-- Backfill existing rows so the column is never NULL for the calibration query.
UPDATE cases SET outcome = 'unknown' WHERE outcome IS NULL;
