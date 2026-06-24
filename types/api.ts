import { z } from 'zod'
import type { FightabilityScore, RejectionCategory, EvidenceSummary } from './case'

export interface ApiError {
  error: string
  code?: string
}

export interface UploadResponse {
  caseId: string
  message: string
}

export interface AnalyseResponse {
  caseId: string
  insurer: string | null
  claimAmount: number | null
  rejectionReasonCategory: RejectionCategory | null
  fightabilityScore: FightabilityScore
  fightabilityReasons: Array<{ reason: string; citation: string | null }>
  fightabilityNumeric: number
  evidenceSummaries: EvidenceSummary[]
  regulationMatchCount: number
  precedentMatchCount: number
  // 6 case-specific sentences. First 2-3 shown unblurred above the paywall,
  // rest rendered inside the blur block. Empty array if LLM call failed.
  pointByPointAnalysis: string[]
}

export interface PaymentOrderResponse {
  orderId: string
  amount: number
  currency: string
  keyId: string
}

export interface DeepAnalyseResponse {
  pointByPointAnalysis: string[]
}

export interface GenerateResponse {
  caseId: string
  letterPath: string | null
  message: string
}

export const ExtractedFactsSchema = z.object({
  insurer: z.string().nullable(),
  claim_amount: z.number().int().nullable(),
  rejection_date: z.string().nullable(),
  rejection_reason_raw: z.string().nullable(),
  rejection_reason_category: z.enum([
    'pre_existing_condition',
    'policy_exclusion',
    'documentation_incomplete',
    'non_disclosure',
    'waiting_period',
    'cashless_denial',
    'experimental_treatment',
    'fraud_suspected',
    'other',
  ]),
  documents_requested_count: z.number().int().nullable(),
  policy_age_months: z.number().int().nullable(),
  policy_type: z.enum([
    'individual',
    'family_floater',
    'group',
    'government_scheme',
    'unknown',
  ]),
  rejection_reason_confidence: z.number().min(0).max(1),
})

export type ExtractedFacts = z.infer<typeof ExtractedFactsSchema>
