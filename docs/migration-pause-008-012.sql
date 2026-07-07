-- ============================================================================
-- ASHRAY — MIGRATION PAUSE BATCH (migrations 008 → 012)
-- Paste this ENTIRE block into the Supabase Studio SQL editor and run once.
-- Every statement is idempotent (IF NOT EXISTS / ON CONFLICT / guarded), so it
-- is safe to re-run. Run against the live project, then reply "done".
-- Source of truth: supabase/migrations/008_*.sql … 012_*.sql (identical).
-- ============================================================================


-- ================= 008_storage_rls =================
-- Tighten Supabase Storage RLS for the `documents` bucket. Private bucket;
-- all access via service_role (server-side) or signed URLs.

INSERT INTO storage.buckets (id, name, public)
  VALUES ('documents', 'documents', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

DO $$
BEGIN
  DROP POLICY IF EXISTS "service_role_insert" ON storage.objects;
  DROP POLICY IF EXISTS "service_role_select" ON storage.objects;
  DROP POLICY IF EXISTS "service_role_update" ON storage.objects;
  DROP POLICY IF EXISTS "service_role_delete" ON storage.objects;
END $$;

CREATE POLICY "service_role_insert" ON storage.objects
  FOR INSERT TO service_role WITH CHECK (bucket_id = 'documents');
CREATE POLICY "service_role_select" ON storage.objects
  FOR SELECT TO service_role USING (bucket_id = 'documents');
CREATE POLICY "service_role_update" ON storage.objects
  FOR UPDATE TO service_role USING (bucket_id = 'documents');
CREATE POLICY "service_role_delete" ON storage.objects
  FOR DELETE TO service_role USING (bucket_id = 'documents');


-- ================= 009_cases_user_id =================
-- A case belongs to a user (nullable until claimed). Anonymous funnel unchanged.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_user_id ON cases(user_id);


-- ================= 010_dispute_stages =================
-- The multi-stage Dispute Engine.

CREATE TABLE IF NOT EXISTS dispute_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('gro', 'bima_bharosa', 'ombudsman', 'consumer_court')),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (
    status IN ('not_started', 'drafted', 'filed', 'awaiting_response', 'resolved', 'escalated')
  ),
  deadline_date DATE,
  filed_at TIMESTAMPTZ,
  generation_decision TEXT CHECK (generation_decision IN ('adapted', 'rebuilt')),
  generation_reason TEXT,
  generation_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_dispute_stages_case ON dispute_stages(case_id);

CREATE TABLE IF NOT EXISTS stage_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES dispute_stages(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (
    artifact_type IN (
      'grievance_letter', 'complaint_form', 'statement_of_case',
      'filing_walkthrough', 'cc_list', 'evidence_checklist'
    )
  ),
  storage_path TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stage_id, artifact_type)
);

CREATE INDEX IF NOT EXISTS idx_stage_artifacts_stage ON stage_artifacts(stage_id);

ALTER TABLE dispute_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_artifacts ENABLE ROW LEVEL SECURITY;


-- ================= 011_backfill_gro_stages =================
-- Every already-paid case gets a GRO stage + its letter as the artifact.

INSERT INTO dispute_stages (case_id, stage, status)
SELECT id, 'gro', CASE WHEN letter_path IS NOT NULL THEN 'drafted' ELSE 'not_started' END
FROM cases
WHERE paid_at IS NOT NULL
ON CONFLICT (case_id, stage) DO NOTHING;

INSERT INTO stage_artifacts (stage_id, artifact_type, storage_path)
SELECT ds.id, 'grievance_letter', c.letter_path
FROM dispute_stages ds
JOIN cases c ON c.id = ds.case_id
WHERE ds.stage = 'gro' AND c.letter_path IS NOT NULL
ON CONFLICT (stage_id, artifact_type) DO NOTHING;


-- ================= 012_kb_authority_type =================
-- kb_chunks.authority_type ∈ {definition, regulation, precedent} + backfill.

ALTER TABLE kb_chunks
  ADD COLUMN IF NOT EXISTS authority_type TEXT
  CHECK (authority_type IN ('definition', 'regulation', 'precedent'));

UPDATE kb_chunks
SET authority_type = CASE
  WHEN tier = 2 THEN 'precedent'
  WHEN source_title ILIKE '%exclusion%' OR section_number ILIKE '%excl%' THEN 'definition'
  ELSE 'regulation'
END
WHERE authority_type IS NULL;

-- ============================================================================
-- DONE. Verify quickly:
--   select count(*) from dispute_stages;      -- >= number of paid cases
--   select count(*) from kb_chunks where authority_type is not null;  -- = 78
-- Then enable Email OTP auth (Authentication → Sign In / Providers → Email →
-- turn on "Email OTP" / magic link) and reply "done".
-- ============================================================================
