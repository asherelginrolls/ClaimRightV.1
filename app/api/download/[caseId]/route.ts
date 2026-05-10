import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import type { ApiError } from '@/types/api'
import { rateLimit } from '@/lib/rate-limit'

type CaseRow = Database['public']['Tables']['cases']['Row']

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
  const { success } = await rateLimit(`download:${ip}`, { maxRequests: 20, windowMs: 60_000 })
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
