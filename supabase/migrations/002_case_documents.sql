CREATE TABLE case_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'rejection_letter', 'policy_document', 'hospital_bills',
    'discharge_summary', 'prior_correspondence', 'other'
  )),
  storage_path TEXT NOT NULL,
  ocr_text TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE case_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON case_documents
  USING (auth.role() = 'service_role');
