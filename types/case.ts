export type CaseStatus = 'uploaded' | 'analysed' | 'paid' | 'generated' | 'delivered'

export type DocType =
  | 'rejection_letter'
  | 'policy_document'
  | 'hospital_bills'
  | 'discharge_summary'
  | 'prior_correspondence'
  | 'other'

export interface CaseDocument {
  id: string
  case_id: string
  doc_type: DocType
  storage_path: string
  ocr_text: string | null
  extracted_facts: SupportingDocFacts | null
  uploaded_at: string
}

// Per-doc structured summary extracted at pre-payment time so the analysis
// screen can reference real facts from policy / bills / discharge / prior
// correspondence without OCRing the full text of every doc upfront.
export type SupportingDocFacts =
  | {
      doc_type: 'policy_document'
      policy_start_date: string | null
      sum_insured: number | null
      policy_type: string | null
      key_exclusions: string[]
    }
  | {
      doc_type: 'hospital_bills'
      bill_total: number | null
      admission_date: string | null
      discharge_date: string | null
    }
  | {
      doc_type: 'discharge_summary'
      primary_diagnosis: string | null
      admission_date: string | null
      discharge_date: string | null
      procedures: string[]
    }
  | {
      doc_type: 'prior_correspondence'
      insurer_communications_count: number | null
      last_communication_date: string | null
    }
  | { doc_type: 'other'; summary_one_sentence: string | null }

export type RejectionCategory =
  | 'pre_existing_condition'
  | 'policy_exclusion'
  | 'documentation_incomplete'
  | 'non_disclosure'
  | 'waiting_period'
  | 'cashless_denial'
  | 'experimental_treatment'
  | 'fraud_suspected'
  | 'other'

export type FightabilityScore = 'low' | 'medium' | 'strong'

export interface FightabilityReason {
  reason: string
  citation: string | null
}

export interface EvidenceSummary {
  source_title: string
  section_number: string | null
  tier: number
  similarity: number
  explainer: string
}

export interface Case {
  id: string
  created_at: string
  email: string | null
  status: CaseStatus
  insurer: string | null
  claim_amount: number | null // stored in paise (1 rupee = 100 paise)
  rejection_reason_raw: string | null
  rejection_reason_category: RejectionCategory | null
  rejection_date: string | null
  fightability_score: FightabilityScore | null
  fightability_reasons: FightabilityReason[] | null
  fightability_numeric: number | null
  evidence_summaries: EvidenceSummary[] | null
  document_path: string | null
  letter_path: string | null
  razorpay_order_id: string | null
  razorpay_payment_id: string | null
  paid_at: string | null
}
