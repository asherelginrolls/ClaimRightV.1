import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import { generateAndDeliver } from '@/lib/deliver'
import type { ApiError } from '@/types/api'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 120

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseUpdate = Database['public']['Tables']['cases']['Update']
type SupabaseClient = ReturnType<typeof createServiceClient>

type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function typedUpdate(supabase: SupabaseClient, values: CaseUpdate): UpdateQuery {
  return (supabase.from('cases').update as unknown as (v: CaseUpdate) => UpdateQuery)(values)
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

  const { data: rawCase, error: caseError } = await supabase
    .from('cases')
    .select('id, status, letter_path')
    .eq('id', caseId)
    .single()

  if (caseError || !rawCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  const caseRow = rawCase as Pick<CaseRow, 'id' | 'status' | 'letter_path'>

  // ── Lazy generation: triggered here rather than fire-and-forget in
  //    payment/verify, so it runs within a real serverless function lifecycle.
  if (caseRow.status === 'paid') {
    // Atomically claim generation to prevent duplicate runs across concurrent polls.
    await typedUpdate(supabase, { status: 'generating' }).eq('id', caseId)
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
      await typedUpdate(supabase, { status: 'paid' }).eq('id', caseId)
      return NextResponse.json({ pending: true, status: 'paid' })
    }

    // Re-fetch after generation to get the updated letter_path
    const { data: refreshed } = await supabase
      .from('cases')
      .select('id, status, letter_path')
      .eq('id', caseId)
      .single()

    if (!refreshed) {
      return NextResponse.json({ error: 'Case not found after generation' }, { status: 404 })
    }

    const refreshedRow = refreshed as Pick<CaseRow, 'id' | 'status' | 'letter_path'>

    if (!refreshedRow.letter_path) {
      return NextResponse.json({ pending: true, status: refreshedRow.status })
    }

    const { data: urlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(refreshedRow.letter_path, 60 * 60)

    if (urlError || !urlData?.signedUrl) {
      return NextResponse.json(
        { error: 'Could not generate download link. Please try again.' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      pending: false,
      signedUrl: urlData.signedUrl,
      caseId: refreshedRow.id,
      status: refreshedRow.status,
    })
  }

  // Another poll already claimed generation — just wait
  if (caseRow.status === 'generating') {
    return NextResponse.json({ pending: true, status: 'generating' })
  }

  // Letter not yet ready for any other pre-generation status
  if (!caseRow.letter_path || (caseRow.status !== 'generated' && caseRow.status !== 'delivered')) {
    return NextResponse.json({ pending: true, status: caseRow.status })
  }

  const { data: urlData, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(caseRow.letter_path, 60 * 60) // 1-hour expiry

  if (urlError || !urlData?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate download link. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    pending: false,
    signedUrl: urlData.signedUrl,
    caseId: caseRow.id,
    status: caseRow.status,
  })
}
