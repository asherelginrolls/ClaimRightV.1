import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import { generateAndDeliver } from '@/lib/deliver'
import { getAuthenticatedUser, canAccessCase } from '@/lib/auth'
import type { ApiError } from '@/types/api'
import { rateLimit } from '@/lib/rate-limit'

// The letter pipeline (strategize ≤60s + grounding ≤25s + letter Sonnet ≤120s +
// PDF/upload) can approach 205s. 120s used to kill the function mid-generation,
// stranding the case at status='generating' with no recovery.
export const maxDuration = 300

// A 'generating' claim older than this is considered dead (the serverless
// function that held it was killed) and is reset to 'paid' so generation retries.
const GENERATION_STALE_MS = 5 * 60_000

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseUpdate = Database['public']['Tables']['cases']['Update']
type SupabaseClient = ReturnType<typeof createServiceClient>

type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function typedUpdate(supabase: SupabaseClient, values: CaseUpdate): UpdateQuery {
  return (supabase.from('cases').update as unknown as (v: CaseUpdate) => UpdateQuery)(values)
}

type ConditionalUpdateResult = {
  data: Array<{ id: string }> | null
  error: { message: string } | null
}
type ConditionalUpdateQuery = {
  eq: (column: string, value: string) => ConditionalUpdateQuery
  select: (columns: string) => Promise<ConditionalUpdateResult>
}
function conditionalUpdate(supabase: SupabaseClient, values: CaseUpdate): ConditionalUpdateQuery {
  return (supabase.from('cases').update as unknown as (v: CaseUpdate) => ConditionalUpdateQuery)(
    values
  )
}

function isMissingColumnError(error: { message: string } | null): boolean {
  return error !== null && /generation_started_at/.test(error.message)
}

/**
 * Atomically claim generation: paid → generating. Returns true only if THIS
 * request won the claim (a row was actually updated). Falls back to a claim
 * without the timestamp until migration 014 is applied.
 */
async function claimGeneration(supabase: SupabaseClient, caseId: string): Promise<boolean> {
  const withTimestamp: CaseUpdate = {
    status: 'generating',
    generation_started_at: new Date().toISOString(),
  }
  let result = await conditionalUpdate(supabase, withTimestamp)
    .eq('id', caseId)
    .eq('status', 'paid')
    .select('id')
  if (isMissingColumnError(result.error)) {
    result = await conditionalUpdate(supabase, { status: 'generating' })
      .eq('id', caseId)
      .eq('status', 'paid')
      .select('id')
  }
  return result.error === null && (result.data?.length ?? 0) > 0
}

/** Reset a dead 'generating' claim back to 'paid' so the next poll retries. */
async function releaseGeneration(supabase: SupabaseClient, caseId: string): Promise<void> {
  const values: CaseUpdate = { status: 'paid', generation_started_at: null }
  const result = await conditionalUpdate(supabase, values)
    .eq('id', caseId)
    .eq('status', 'generating')
    .select('id')
  if (isMissingColumnError(result.error)) {
    await conditionalUpdate(supabase, { status: 'paid' })
      .eq('id', caseId)
      .eq('status', 'generating')
      .select('id')
  }
}

type CaseStateRow = Pick<CaseRow, 'id' | 'status' | 'letter_path' | 'user_id'> & {
  generation_started_at?: string | null
}

/** Fetch case state; tolerates the generation_started_at column not existing yet. */
async function fetchCaseState(
  supabase: SupabaseClient,
  caseId: string
): Promise<CaseStateRow | null> {
  const { data, error } = await supabase
    .from('cases')
    .select('id, status, letter_path, user_id, generation_started_at')
    .eq('id', caseId)
    .single()
  if (!error && data) return data as CaseStateRow
  if (error && /generation_started_at/.test(error.message)) {
    const { data: fallback } = await supabase
      .from('cases')
      .select('id, status, letter_path, user_id')
      .eq('id', caseId)
      .single()
    return (fallback as CaseStateRow | null) ?? null
  }
  return null
}

interface DownloadReadyResponse {
  pending: false
  signedUrl: string
  caseId: string
  status: CaseRow['status']
}

interface DownloadPendingResponse {
  pending: true
  status: CaseRow['status']
}

async function signedUrlResponse(
  supabase: SupabaseClient,
  caseRow: Pick<CaseRow, 'id' | 'status'>,
  letterPath: string
): Promise<NextResponse<DownloadReadyResponse | ApiError>> {
  const { data: urlData, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(letterPath, 60 * 60) // 1-hour expiry

  if (urlError || !urlData?.signedUrl) {
    return NextResponse.json(
      { error: 'Could not generate download link. Please try again.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    pending: false,
    signedUrl: urlData.signedUrl,
    caseId: caseRow.id,
    status: caseRow.status,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } },
): Promise<NextResponse<DownloadReadyResponse | DownloadPendingResponse | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  // 60/min: the client polls every 3s; letter generation can take 60-90s so we
  // need headroom for ~30 polls before the letter is ready.
  const { success } = await rateLimit(`download:${ip}`, { maxRequests: 60, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute before trying again.' },
      { status: 429 }
    )
  }

  const { caseId } = params

  const supabase = createServiceClient()

  const caseRow = await fetchCaseState(supabase, caseId)
  if (!caseRow) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  // Access: the uploading browser (cr_sid cookie) for anonymous cases, the
  // owner for claimed cases. Anyone else — e.g. an email link opened on a new
  // device — gets a 403 the page turns into a sign-in-and-claim prompt.
  const user = await getAuthenticatedUser()
  if (
    !canAccessCase(
      { id: caseRow.id, user_id: caseRow.user_id },
      user?.id ?? null,
      request.cookies.get('cr_sid')?.value
    )
  ) {
    return NextResponse.json(
      { error: 'Sign in to open this case.', code: 'sign_in_required' },
      { status: 403 }
    )
  }

  // ── Stale-claim recovery: a 'generating' case whose claim is older than
  //    GENERATION_STALE_MS (or predates migration 014's timestamp) belongs to a
  //    function Vercel already killed. Reset it so generation retries instead of
  //    leaving the user on a spinner forever.
  if (caseRow.status === 'generating') {
    const startedAt = caseRow.generation_started_at
      ? new Date(caseRow.generation_started_at).getTime()
      : null
    const isStale = startedAt === null || Date.now() - startedAt > GENERATION_STALE_MS
    // If the letter already exists, the previous run died between upload and
    // status update — just serve it.
    if (caseRow.letter_path) {
      await typedUpdate(supabase, { status: 'generated' }).eq('id', caseId)
      return signedUrlResponse(supabase, { id: caseRow.id, status: 'generated' }, caseRow.letter_path)
    }
    // Pre-migration-014 the timestamp column doesn't exist, so we can't tell a
    // dead claim from a live one. The page's ?stuck=1 retry (sent only after
    // ~7 min of polling — past any possible live 300s function) is the
    // fallback signal; access is already ownership-checked above.
    const columnMissing = !('generation_started_at' in caseRow)
    const clientAttestsStuck = request.nextUrl.searchParams.get('stuck') === '1'
    if (columnMissing ? !clientAttestsStuck : !isStale) {
      // An active run (or pre-014 with no stuck signal) — wait.
      return NextResponse.json({ pending: true, status: 'generating' })
    }
    if (columnMissing) {
      console.error(
        '[download] migration 014 not applied — recovering stuck case via client signal caseId=' + caseId
      )
    }
    console.warn('[download] stale generating claim reset caseId=' + caseId)
    await releaseGeneration(supabase, caseId)
    caseRow.status = 'paid'
  }

  // ── Lazy generation: triggered here rather than fire-and-forget in
  //    payment/verify, so it runs within a real serverless function lifecycle.
  if (caseRow.status === 'paid') {
    // Atomically claim generation (paid → generating, WHERE status='paid') so
    // concurrent polls can never run the pipeline twice.
    const claimed = await claimGeneration(supabase, caseId)
    if (!claimed) {
      // Another poll holds the claim — just wait.
      return NextResponse.json({ pending: true, status: 'generating' })
    }
    console.info('[download] stage: generation-start caseId=' + caseId)
    try {
      await generateAndDeliver(caseId, supabase)
      console.info('[download] stage: generation-done caseId=' + caseId)
    } catch (err) {
      console.error(
        '[download] generateAndDeliver failed for',
        caseId,
        ':',
        err instanceof Error ? err.message : String(err),
      )
      // Reset to 'paid' so the next poll retries generation.
      await releaseGeneration(supabase, caseId)
      return NextResponse.json({ pending: true, status: 'paid' })
    }

    // Re-fetch after generation to get the updated letter_path
    const refreshed = await fetchCaseState(supabase, caseId)
    if (!refreshed) {
      return NextResponse.json({ error: 'Case not found after generation' }, { status: 404 })
    }
    if (!refreshed.letter_path) {
      return NextResponse.json({ pending: true, status: refreshed.status })
    }
    return signedUrlResponse(supabase, refreshed, refreshed.letter_path)
  }

  // Letter not yet ready for any other pre-generation status
  if (!caseRow.letter_path || (caseRow.status !== 'generated' && caseRow.status !== 'delivered')) {
    return NextResponse.json({ pending: true, status: caseRow.status })
  }

  return signedUrlResponse(supabase, caseRow, caseRow.letter_path)
}
