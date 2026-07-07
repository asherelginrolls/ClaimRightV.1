-- Tighten Supabase Storage RLS for the `documents` bucket.
-- Ensure the bucket exists and is private (not public).
-- All access is via service_role (server-side) or signed URLs.
-- Anon/authenticated users never need direct bucket access.

INSERT INTO storage.buckets (id, name, public)
  VALUES ('documents', 'documents', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

-- Drop any existing policies on storage.objects for this bucket first
-- (safe to run multiple times — policies on storage.objects are named)
DO $$
BEGIN
  DROP POLICY IF EXISTS "service_role_insert" ON storage.objects;
  DROP POLICY IF EXISTS "service_role_select" ON storage.objects;
  DROP POLICY IF EXISTS "service_role_update" ON storage.objects;
  DROP POLICY IF EXISTS "service_role_delete" ON storage.objects;
END $$;

CREATE POLICY "service_role_insert" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "service_role_select" ON storage.objects
  FOR SELECT TO service_role
  USING (bucket_id = 'documents');

CREATE POLICY "service_role_update" ON storage.objects
  FOR UPDATE TO service_role
  USING (bucket_id = 'documents');

CREATE POLICY "service_role_delete" ON storage.objects
  FOR DELETE TO service_role
  USING (bucket_id = 'documents');
