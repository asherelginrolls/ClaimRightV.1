// Download a stage artifact via an ownership-checked signed URL.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import { getAuthenticatedUser, canAccessCase } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import type { ApiError } from '@/types/api'

type CaseRow = Database['public']['Tables']['cases']['Row']
type StageRow = Database['public']['Tables']['dispute_stages']['Row']
type ArtifactRow = Database['public']['Tables']['stage_artifacts']['Row']

export async function GET(
  request: NextRequest,
  { params }: { params: { artifactId: string } }
): Promise<NextResponse<{ signedUrl: string } | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { success } = await rateLimit(`artifact-dl:${ip}`, { maxRequests: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  const user = await getAuthenticatedUser()
  const supabase = createServiceClient()

  const { data: rawArtifact } = await supabase
    .from('stage_artifacts')
    .select('*')
    .eq('id', params.artifactId)
    .single()
  if (!rawArtifact) return NextResponse.json({ error: 'Artifact not found.' }, { status: 404 })
  const artifact = rawArtifact as ArtifactRow

  const { data: rawStage } = await supabase
    .from('dispute_stages')
    .select('*')
    .eq('id', artifact.stage_id)
    .single()
  if (!rawStage) return NextResponse.json({ error: 'Stage not found.' }, { status: 404 })
  const stage = rawStage as StageRow

  const { data: rawCase } = await supabase
    .from('cases')
    .select('*')
    .eq('id', stage.case_id)
    .single()
  if (!rawCase) return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
  const caseRow = rawCase as CaseRow

  if (!canAccessCase(caseRow, user?.id ?? null, request.cookies.get('cr_sid')?.value)) {
    return NextResponse.json({ error: 'Not your case.' }, { status: 403 })
  }

  const { data: urlData, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(artifact.storage_path, 60 * 60)
  if (urlError || !urlData?.signedUrl) {
    return NextResponse.json({ error: 'Could not create download link.' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: urlData.signedUrl })
}
