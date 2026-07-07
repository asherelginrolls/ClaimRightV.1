// Advance a case to the next escalation stage. Validates the ladder order,
// gates on paid_at (₹299 covers all stages of a case), and creates the next
// stage row. Artifact generation happens lazily on the stages GET poll.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient, type Database } from '@/lib/supabase'
import { getAuthenticatedUser, canAccessCase } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { STAGE_ORDER, type DisputeStage } from '@/lib/deadlines'
import type { ApiError } from '@/types/api'

type CaseRow = Database['public']['Tables']['cases']['Row']
type StageRow = Database['public']['Tables']['dispute_stages']['Row']
type StageInsert = Database['public']['Tables']['dispute_stages']['Insert']
type StageUpdate = Database['public']['Tables']['dispute_stages']['Update']
type SupabaseClient = ReturnType<typeof createServiceClient>

const BodySchema = z.object({
  toStage: z.enum(['bima_bharosa', 'ombudsman', 'consumer_court']),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
): Promise<NextResponse<{ advanced: true; stage: DisputeStage } | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { success } = await rateLimit(`stage-advance:${ip}`, { maxRequests: 10, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const user = await getAuthenticatedUser()
  const supabase = createServiceClient()
  const { data: rawCase, error: caseError } = await supabase
    .from('cases')
    .select('*')
    .eq('id', params.caseId)
    .single()
  if (caseError || !rawCase) return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
  const caseRow = rawCase as CaseRow

  if (!canAccessCase(caseRow, user?.id ?? null, request.cookies.get('cr_sid')?.value)) {
    return NextResponse.json({ error: 'Not your case.' }, { status: 403 })
  }
  if (!caseRow.paid_at) {
    return NextResponse.json(
      { error: 'The dispute engine unlocks after the one-time ₹299 payment for this case.' },
      { status: 402 }
    )
  }

  // Ladder-order validation: the immediately-previous stage must exist.
  const { data: rawStages } = await supabase
    .from('dispute_stages')
    .select('*')
    .eq('case_id', params.caseId)
  const stages = (rawStages ?? []) as StageRow[]
  const targetIdx = STAGE_ORDER.indexOf(body.toStage)
  const priorStageName = STAGE_ORDER[targetIdx - 1]
  const priorStage = stages.find((s) => s.stage === priorStageName)

  if (!priorStage) {
    return NextResponse.json(
      { error: `Complete the ${priorStageName} stage before advancing to ${body.toStage}.` },
      { status: 409 }
    )
  }
  if (stages.some((s) => s.stage === body.toStage)) {
    return NextResponse.json({ advanced: true, stage: body.toStage }) // idempotent
  }

  const insert: StageInsert = {
    case_id: params.caseId,
    stage: body.toStage,
    status: 'not_started',
  }
  const { error: insertError } = await (
    supabase.from('dispute_stages').insert as unknown as (
      v: StageInsert
    ) => Promise<{ error: { message: string } | null }>
  )(insert)
  if (insertError) {
    return NextResponse.json({ error: 'Could not advance the case. Try again.' }, { status: 500 })
  }

  // Mark the prior stage escalated (it did not resolve the dispute).
  if (priorStage.status !== 'resolved') {
    await (
      supabase.from('dispute_stages').update as unknown as (
        v: StageUpdate
      ) => { eq: (c: string, v2: string) => Promise<{ error: unknown }> }
    )({ status: 'escalated' }).eq('id', priorStage.id)
  }

  return NextResponse.json({ advanced: true, stage: body.toStage })
}
