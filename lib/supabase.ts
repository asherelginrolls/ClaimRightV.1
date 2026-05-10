import { createServerClient, createBrowserClient as createSupabaseBrowserClient, type CookieOptions } from '@supabase/ssr'
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
          status: 'uploaded' | 'analysed' | 'paid' | 'generated' | 'delivered'
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
          document_path: string | null
          letter_path: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          paid_at: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          email?: string | null
          status?: 'uploaded' | 'analysed' | 'paid' | 'generated' | 'delivered'
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
          document_path?: string | null
          letter_path?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          paid_at?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          email?: string | null
          status?: 'uploaded' | 'analysed' | 'paid' | 'generated' | 'delivered'
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
          document_path?: string | null
          letter_path?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          paid_at?: string | null
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
          uploaded_at?: string
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

export function createBrowserClient() {
  return createSupabaseBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
