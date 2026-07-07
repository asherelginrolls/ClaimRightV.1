// List a case's dispute stages + artifacts, with lazy artifact generation.
// Mirrors /api/download: generation runs INSIDE this request (fire-and-forget
// dies on Vercel), guarded by the generation_started_at lock so concurrent
// polls never double-generate. Clients poll every few seconds while pending.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import { getAuthenticatedUser, canAccessCase } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { generateStageArtifacts } from '@/lib/artifacts'
import { computeDeadline, type DisputeStage } from '@/lib/deadlines'
import type { ApiError } from '@/types/api'

export const maxDuration = 120

type CaseRow = Database['public']['Tables']['cases']['Row']
type StageRow = Database['public']['Tables']['dispute_stages']['Row']
type StageUpdate = Database['public']['Tables']['dispute_stages']['Update']
type ArtifactRow = Database['public']['Tables']['stage_artifacts']['Row']
type SupabaseClient = ReturnType<typeof createServiceClient>

type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function updateStage(supabase: SupabaseClient, values: StageUpdate): UpdateQuery {
  return (supabase.from('dispute_stages').update as unknown as (v: StageUpdate) => UpdateQuery)(
    values
  )
}

export interface StageWithArtifacts {
  id: string
  stage: StageRow['stage']
  status: StageRow['status']
  deadlineDate: string | null
  deadlineLabel: string
  deadlineHard: boolean
  filedAt: string | null
  generationDecision: StageRow['generation_decision']
  generationReason: string | null
  generating: boolean
  artifacts: Array<{ id: string; type: ArtifactRow['artifact_type']; generatedAt: string }>
}

// A generation lock older than this is considered dead (crashed run) and retried.
const LOCK_STALE_MS = 3 * 60_000

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
): Promise<NextResponse<{ stages: StageWithArtifacts[] } | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { success } = await rateLimit(`stages:${ip}`, { maxRequests: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

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

  let { data: rawStages } = await supabase
    .from('dispute_stages')
    .select('*')
    .eq('case_id', params.caseId)
    .order('created_at', { ascending: true })
  let stages = (rawStages ?? []) as StageRow[]

  // Lazy generation: exactly one pending stage can generate per request.
  const pending = stages.find(
    (s) =>
      s.stage !== 'consumer_court' &&
      s.status === 'not_started' &&
      (!s.generation_started_at ||
        Date.now() - new Date(s.generation_started_at).getTime() > LOCK_STALE_MS)
  )
  if (pending && caseRow.paid_at) {
    // Claim the lock; only proceed if we actually flipped it (best-effort
    // versus concurrent polls — the eq on the old value narrows the race).
    const { error: lockError } = await updateStage(supabase, {
      generation_started_at: new Date().toISOString(),
    }).eq('id', pending.id)

    if (!lockError) {
      try {
        console.info(`[stages] generating ${pending.stage} artifacts for case ${params.caseId}`)
        await generateStageArtifacts(params.caseId, pending.stage as DisputeStage)
      } catch (err) {
        console.error(
          `[stages] generation failed for ${pending.stage}:`,
          err instanceof Error ? err.message : String(err)
        )
        // Clear the lock so the next poll retries.
        await updateStage(supabase, { generation_started_at: null }).eq('id', pending.id)
      }
      const { data: refreshed } = await supabase
        .from('dispute_stages')
        .select('*')
        .eq('case_id', params.caseId)
        .order('created_at', { ascending: true })
      stages = (refreshed ?? []) as StageRow[]
    }
  }

  const stageIds = stages.map((s) => s.id)
  let artifacts: ArtifactRow[] = []
  if (stageIds.length > 0) {
    const { data: rawArtifacts } = await supabase
      .from('stage_artifacts')
      .select('*')
      .in('stage_id', stageIds)
    artifacts = (rawArtifacts ?? []) as ArtifactRow[]
  }

  const result: StageWithArtifacts[] = stages.map((s) => {
    const priorFiledAt =
      stages.find((p) => p.stage === 'gro' && s.stage === 'bima_bharosa')?.filed_at ?? null
    const deadline = computeDeadline(s.stage as DisputeStage, s.status, {
      rejectionDate: caseRow.rejection_date,
      filedAt: s.filed_at,
      priorStageFiledAt: priorFiledAt,
    })
    return {
      id: s.id,
      stage: s.stage,
      status: s.status,
      deadlineDate: s.deadline_date ?? deadline.date,
      deadlineLabel: deadline.label,
      deadlineHard: deadline.hard,
      filedAt: s.filed_at,
      generationDecision: s.generation_decision,
      generationReason: s.generation_reason,
      generating: s.status === 'not_started' && s.generation_started_at !== null,
      artifacts: artifacts
        .filter((a) => a.stage_id === s.id)
        .map((a) => ({ id: a.id, type: a.artifact_type, generatedAt: a.generated_at })),
    }
  })

  return NextResponse.json({ stages: result })
}
