-- Fix missing DML grants on case_documents for service_role.
-- Migration 002 created the table and enabled RLS but never ran GRANT,
-- causing all API inserts via the service-role client to return 403.
GRANT SELECT, INSERT, UPDATE, DELETE ON case_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON case_documents TO authenticated;
GRANT SELECT ON case_documents TO anon;
