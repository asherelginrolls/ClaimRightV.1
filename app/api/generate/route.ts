import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import { generateDisputeLetter } from '@/lib/generation'
import type { ApiError } from '@/types/api'
import { rateLimit } from '@/lib/rate-limit'

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseUpdate = Database['public']['Tables']['cases']['Update']

// Type cast required: supabase-js generic resolution issue with custom Database types
// (same pattern as lib/retrieval.ts and app/api/analyse/route.ts)
type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function typedUpdate(
  supabase: ReturnType<typeof createServiceClient>,
  values: CaseUpdate
): UpdateQuery {
  return (
    supabase.from('cases').update as unknown as (v: CaseUpdate) => UpdateQuery
  )(values)
}

interface GenerateSuccessResponse {
  caseId: string
  message: string
  citationsFailed: number
  citationsFlagged: number
  kbMissNote: string | null
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<GenerateSuccessResponse | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { success } = rateLimit(`generate:${ip}`, { maxRequests: 3, windowMs: 300_000 })
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait 5 minutes before trying again.' },
      { status: 429 }
    )
  }

  let caseId: string | undefined
  try {
    const body = (await request.json()) as { caseId?: string }
    caseId = body.caseId
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!caseId) {
    return NextResponse.json({ error: 'caseId is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: rawCase, error: caseError } = await supabase
    .from('cases')
    .select('id, status')
    .eq('id', caseId)
    .single()

  if (caseError || !rawCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  const caseRow = rawCase as Pick<CaseRow, 'id' | 'status'>

  if (caseRow.status !== 'paid') {
    return NextResponse.json(
      { error: 'Payment required before generating letter' },
      { status: 403 }
    )
  }

  try {
    const result = await generateDisputeLetter(caseId)

    await typedUpdate(supabase, { status: 'generated' }).eq('id', caseId)

    return NextResponse.json({
      caseId,
      message: 'Letter generated',
      citationsFailed: result.citationsFailed,
      citationsFlagged: result.citationsFlagged,
      kbMissNote: result.kbMissNote,
    })
  } catch (error) {
    console.error('[generate] Error:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 500 })
  }
}
