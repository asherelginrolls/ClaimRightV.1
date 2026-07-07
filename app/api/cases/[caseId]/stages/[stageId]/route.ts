// Stage status updates: "I filed" (→ filed + filed_at + recomputed deadline)
// and "resolved". The deadline chip flips from file-by to response-due.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient, type Database } from '@/lib/supabase'
import { getAuthenticatedUser, canAccessCase } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { computeDeadline, type DisputeStage } from '@/lib/deadlines'
import type { ApiError } from '@/types/api'

type CaseRow = Database['public']['Tables']['cases']['Row']
type StageRow = Database['public']['Tables']['dispute_stages']['Row']
type StageUpdate = Database['public']['Tables']['dispute_stages']['Update']
type SupabaseClient = ReturnType<typeof createServiceClient>

type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function updateStage(supabase: SupabaseClient, values: StageUpdate): UpdateQuery {
  return (supabase.from('dispute_stages').update as unknown as (v: StageUpdate) => UpdateQuery)(
    values
  )
}

const BodySchema = z.object({
  action: z.enum(['filed', 'resolved']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { caseId: string; stageId: string } }
): Promise<NextResponse<{ updated: true } | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { success } = await rateLimit(`stage-patch:${ip}`, { maxRequests: 20, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const user = await getAuthenticatedUser()
  const supabase = createServiceClient()

  const { data: rawCase } = await supabase
    .from('cases')
    .select('*')
    .eq('id', params.caseId)
    .single()
  if (!rawCase) return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
  const caseRow = rawCase as CaseRow

  if (!canAccessCase(caseRow, user?.id ?? null, request.cookies.get('cr_sid')?.value)) {
    return NextResponse.json({ error: 'Not your case.' }, { status: 403 })
  }

  const { data: rawStage } = await supabase
    .from('dispute_stages')
    .select('*')
    .eq('id', params.stageId)
    .eq('case_id', params.caseId)
    .single()
  if (!rawStage) return NextResponse.json({ error: 'Stage not found.' }, { status: 404 })
  const stageRow = rawStage as StageRow

  if (body.action === 'filed') {
    const filedAt = new Date().toISOString()
    const deadline = computeDeadline(stageRow.stage as DisputeStage, 'filed', {
      rejectionDate: caseRow.rejection_date,
      filedAt,
    })
    const { error } = await updateStage(supabase, {
      status: 'awaiting_response',
      filed_at: filedAt,
      deadline_date: deadline.date,
    }).eq('id', params.stageId)
    if (error) return NextResponse.json({ error: 'Update failed.' }, { status: 500 })
  } else {
    const { error } = await updateStage(supabase, { status: 'resolved' }).eq('id', params.stageId)
    if (error) return NextResponse.json({ error: 'Update failed.' }, { status: 500 })
  }

  return NextResponse.json({ updated: true })
}
