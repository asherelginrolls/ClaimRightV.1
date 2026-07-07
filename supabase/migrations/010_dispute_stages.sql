-- Phase 4: the multi-stage Dispute Engine. A case is a journey along the
-- escalation ladder (GRO → Bima Bharosa → Ombudsman → Consumer Court); each
-- stage is a first-class object with its own status, deadline, generated
-- artifacts, and a logged adapt-vs-rebuild decision.

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
  -- Lazy-generation lock: set when a poll request starts generating this
  -- stage's artifacts so concurrent polls don't double-generate.
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

-- Service-role-only access: RLS enabled with NO anon/authenticated policies.
-- Ownership checks live in the API routes (service client + case.user_id match),
-- same pattern as cases/case_documents.
ALTER TABLE dispute_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_artifacts ENABLE ROW LEVEL SECURITY;
