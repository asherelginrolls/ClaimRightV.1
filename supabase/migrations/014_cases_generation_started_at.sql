-- 014: track when letter generation was claimed so a killed serverless function
-- (Vercel timeout mid-generation) cannot strand a case at status='generating'
-- forever. The download route resets stale claims (> 5 min) back to 'paid' and
-- retries. Run in Supabase Studio SQL editor.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMPTZ;
