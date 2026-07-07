-- Phase 4: backfill. Every already-paid case gets a GRO stage row, and its
-- delivered dispute letter becomes that stage's grievance_letter artifact.
-- Idempotent (ON CONFLICT / NOT EXISTS) so re-running is harmless.

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
