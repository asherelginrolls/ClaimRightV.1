export type CaseStatus = 'uploaded' | 'analysed' | 'paid' | 'generated' | 'delivered'

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
  document_path: string | null
  letter_path: string | null
  razorpay_order_id: string | null
  razorpay_payment_id: string | null
  paid_at: string | null
}
