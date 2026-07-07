-- Phase 4: accounts. A case belongs to a user (nullable until the user signs
-- in and claims it — the anonymous funnel is unchanged). Session binding
-- stays cookie-based (cr_sid = caseId), so no session_id column is needed.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_user_id ON cases(user_id);
