-- Fix missing DML grants on the dispute-engine tables for service_role.
-- Migration 010 created dispute_stages/stage_artifacts and enabled RLS but never
-- ran GRANT, so all API access via the service-role client returned 403 (same
-- class of bug as 004_fix_case_documents_grants). GRANT is idempotent.
-- (010 now includes these grants too, for fresh installs; this migration patches
-- databases that already ran the original 010.)

GRANT SELECT, INSERT, UPDATE, DELETE ON dispute_stages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON stage_artifacts TO service_role;
