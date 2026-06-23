import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient, type Database } from '@/lib/supabase'
import type { ApiError } from '@/types/api'

// Admin-only route — protected by ADMIN_SECRET (same scheme as /api/kb/ingest).
// This is how LABELED outcome data enters the system: an operator records the
// real dispute result for a case so the scoring calibration dataset accumulates
// (see scripts/scoring-report.ts). It does NOT change any user-facing behavior.

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseUpdate = Database['public']['Tables']['cases']['Update']
type SupabaseClient = ReturnType<typeof createServiceClient>

// Type cast required: supabase-js generic resolution issue with custom Database
// types (same pattern as the other routes).
type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function typedUpdate(supabase: SupabaseClient, values: CaseUpdate): UpdateQuery {
  return (supabase.from('cases').update as unknown as (v: CaseUpdate) => UpdateQuery)(values)
}

const OutcomeRequestSchema = z.object({
  caseId: z.string().uuid(),
  outcome: z.enum(['won', 'partial', 'lost', 'withdrawn', 'unknown']),
  outcome_stage: z.enum(['gro', 'igms', 'ombudsman', 'court']).nullish(),
})

interface OutcomeSuccessResponse {
  caseId: string
  outcome: string
  outcome_stage: string | null
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<OutcomeSuccessResponse | ApiError>> {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    return NextResponse.json({ error: 'Admin secret not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = OutcomeRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid outcome payload', code: 'validation_error' },
      { status: 400 }
    )
  }
  const { caseId, outcome, outcome_stage } = parsed.data

  const supabase = createServiceClient()

  const { data: rawCase, error: caseError } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .single()

  if (caseError || !rawCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }
  const caseRow = rawCase as Pick<CaseRow, 'id'>

  const { error: updateError } = await typedUpdate(supabase, {
    outcome,
    outcome_stage: outcome_stage ?? null,
    outcome_recorded_at: new Date().toISOString(),
  }).eq('id', caseRow.id)

  if (updateError) {
    console.error('[admin/outcome] update failed:', updateError.message)
    return NextResponse.json({ error: 'Failed to record outcome' }, { status: 500 })
  }

  return NextResponse.json({ caseId: caseRow.id, outcome, outcome_stage: outcome_stage ?? null })
}
