import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export type Database = {
  public: {
    Tables: {
      cases: {
        Relationships: []
        Row: {
          id: string
          created_at: string
          email: string | null
          status: 'uploaded' | 'analysed' | 'paid' | 'generating' | 'generated' | 'delivered'
          insurer: string | null
          claim_amount: number | null
          rejection_reason_raw: string | null
          rejection_reason_category:
            | 'pre_existing_condition'
            | 'policy_exclusion'
            | 'documentation_incomplete'
            | 'non_disclosure'
            | 'waiting_period'
            | 'cashless_denial'
            | 'experimental_treatment'
            | 'fraud_suspected'
            | 'other'
            | null
          rejection_date: string | null
          fightability_score: 'low' | 'medium' | 'strong' | null
          fightability_reasons: Array<{ reason: string; citation: string | null }> | null
          fightability_numeric: number | null
          evidence_summaries: Array<{ source_title: string; section_number: string | null; tier: number; similarity: number; explainer: string }> | null
          point_by_point_analysis: string[] | null
          document_path: string | null
          letter_path: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          paid_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          email?: string | null
          status?: 'uploaded' | 'analysed' | 'paid' | 'generating' | 'generated' | 'delivered'
          insurer?: string | null
          claim_amount?: number | null
          rejection_reason_raw?: string | null
          rejection_reason_category?:
            | 'pre_existing_condition'
            | 'policy_exclusion'
            | 'documentation_incomplete'
            | 'non_disclosure'
            | 'waiting_period'
            | 'cashless_denial'
            | 'experimental_treatment'
            | 'fraud_suspected'
            | 'other'
            | null
          rejection_date?: string | null
          fightability_score?: 'low' | 'medium' | 'strong' | null
          fightability_reasons?: Array<{ reason: string; citation: string | null }> | null
          fightability_numeric?: number | null
          evidence_summaries?: Array<{ source_title: string; section_number: string | null; tier: number; similarity: number; explainer: string }> | null
          point_by_point_analysis?: string[] | null
          document_path?: string | null
          letter_path?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          paid_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          email?: string | null
          status?: 'uploaded' | 'analysed' | 'paid' | 'generating' | 'generated' | 'delivered'
          insurer?: string | null
          claim_amount?: number | null
          rejection_reason_raw?: string | null
          rejection_reason_category?:
            | 'pre_existing_condition'
            | 'policy_exclusion'
            | 'documentation_incomplete'
            | 'non_disclosure'
            | 'waiting_period'
            | 'cashless_denial'
            | 'experimental_treatment'
            | 'fraud_suspected'
            | 'other'
            | null
          rejection_date?: string | null
          fightability_score?: 'low' | 'medium' | 'strong' | null
          fightability_reasons?: Array<{ reason: string; citation: string | null }> | null
          fightability_numeric?: number | null
          evidence_summaries?: Array<{ source_title: string; section_number: string | null; tier: number; similarity: number; explainer: string }> | null
          point_by_point_analysis?: string[] | null
          document_path?: string | null
          letter_path?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          paid_at?: string | null
          user_id?: string | null
        }
      }
      case_documents: {
        Relationships: []
        Row: {
          id: string
          case_id: string
          doc_type:
            | 'rejection_letter'
            | 'policy_document'
            | 'hospital_bills'
            | 'discharge_summary'
            | 'prior_correspondence'
            | 'other'
          storage_path: string
          ocr_text: string | null
          extracted_facts: Record<string, unknown> | null
          uploaded_at: string
        }
        Insert: {
          id?: string
          case_id: string
          doc_type:
            | 'rejection_letter'
            | 'policy_document'
            | 'hospital_bills'
            | 'discharge_summary'
            | 'prior_correspondence'
            | 'other'
          storage_path: string
          ocr_text?: string | null
          extracted_facts?: Record<string, unknown> | null
          uploaded_at?: string
        }
        Update: {
          id?: string
          case_id?: string
          doc_type?:
            | 'rejection_letter'
            | 'policy_document'
            | 'hospital_bills'
            | 'discharge_summary'
            | 'prior_correspondence'
            | 'other'
          storage_path?: string
          ocr_text?: string | null
          extracted_facts?: Record<string, unknown> | null
          uploaded_at?: string
        }
      }
      dispute_stages: {
        Relationships: []
        Row: {
          id: string
          case_id: string
          stage: 'gro' | 'bima_bharosa' | 'ombudsman' | 'consumer_court'
          status: 'not_started' | 'drafted' | 'filed' | 'awaiting_response' | 'resolved' | 'escalated'
          deadline_date: string | null
          filed_at: string | null
          generation_decision: 'adapted' | 'rebuilt' | null
          generation_reason: string | null
          generation_started_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          case_id: string
          stage: 'gro' | 'bima_bharosa' | 'ombudsman' | 'consumer_court'
          status?: 'not_started' | 'drafted' | 'filed' | 'awaiting_response' | 'resolved' | 'escalated'
          deadline_date?: string | null
          filed_at?: string | null
          generation_decision?: 'adapted' | 'rebuilt' | null
          generation_reason?: string | null
          generation_started_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          case_id?: string
          stage?: 'gro' | 'bima_bharosa' | 'ombudsman' | 'consumer_court'
          status?: 'not_started' | 'drafted' | 'filed' | 'awaiting_response' | 'resolved' | 'escalated'
          deadline_date?: string | null
          filed_at?: string | null
          generation_decision?: 'adapted' | 'rebuilt' | null
          generation_reason?: string | null
          generation_started_at?: string | null
          created_at?: string
        }
      }
      stage_artifacts: {
        Relationships: []
        Row: {
          id: string
          stage_id: string
          artifact_type: 'grievance_letter' | 'complaint_form' | 'statement_of_case' | 'filing_walkthrough' | 'cc_list' | 'evidence_checklist'
          storage_path: string
          generated_at: string
        }
        Insert: {
          id?: string
          stage_id: string
          artifact_type: 'grievance_letter' | 'complaint_form' | 'statement_of_case' | 'filing_walkthrough' | 'cc_list' | 'evidence_checklist'
          storage_path: string
          generated_at?: string
        }
        Update: {
          id?: string
          stage_id?: string
          artifact_type?: 'grievance_letter' | 'complaint_form' | 'statement_of_case' | 'filing_walkthrough' | 'cc_list' | 'evidence_checklist'
          storage_path?: string
          generated_at?: string
        }
      }
      kb_chunks: {
        Relationships: []
        Row: {
          id: string
          created_at: string
          tier: 1 | 2 | 3
          source_title: string
          section_number: string | null
          date: string | null
          circular_number: string | null
          issuer: string
          url: string | null
          content: string
          embedding: number[] | null
          fts: unknown | null
        }
        Insert: {
          id?: string
          created_at?: string
          tier: 1 | 2 | 3
          source_title: string
          section_number?: string | null
          date?: string | null
          circular_number?: string | null
          issuer: string
          url?: string | null
          content: string
          embedding?: number[] | null
        }
        Update: {
          id?: string
          created_at?: string
          tier?: 1 | 2 | 3
          source_title?: string
          section_number?: string | null
          date?: string | null
          circular_number?: string | null
          issuer?: string
          url?: string | null
          content?: string
          embedding?: number[] | null
        }
      }
    }
    Functions: {
      match_kb_chunks: {
        Args: {
          query_embedding: number[]
          query_text: string
          match_threshold?: number
          match_count?: number
        }
        Returns: Array<{
          id: string
          content: string
          source_title: string
          section_number: string | null
          circular_number: string | null
          issuer: string
          url: string | null
          tier: number
          similarity: number
        }>
      }
    }
    Enums: Record<string, never>
  }
}

export function createClient() {
  const cookieStore = cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )
}

export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
