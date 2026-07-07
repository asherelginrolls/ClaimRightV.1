// Add a document to an existing case (e.g. the insurer's GRO reply before
// escalating). Same validation as the original upload; the rebuild decision
// in lib/stage-policy.ts consumes documents added after the previous stage.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServiceClient, type Database } from '@/lib/supabase'
import { getAuthenticatedUser, canAccessCase } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import type { ApiError } from '@/types/api'
import type { DocType } from '@/types/case'

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseDocInsert = Database['public']['Tables']['case_documents']['Insert']

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const ALLOWED_DOC_TYPES = new Set<DocType>([
  'policy_document', 'hospital_bills', 'discharge_summary', 'prior_correspondence', 'other',
])
const MAX_BYTES = 10 * 1024 * 1024

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false
  if (mimeType === 'application/pdf')
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
  if (mimeType === 'image/png')
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8
  return false
}

function extFromMime(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType === 'image/png') return 'png'
  return 'jpg'
}

export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
): Promise<NextResponse<{ added: true } | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { success } = await rateLimit(`case-doc:${ip}`, { maxRequests: 5, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

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

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const docType = (formData.get('doc_type') as string | null) ?? 'prior_correspondence'

    if (!file) return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
    if (!ALLOWED_DOC_TYPES.has(docType as DocType)) {
      return NextResponse.json({ error: `Invalid doc_type: ${docType}` }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Only PDF, JPG, and PNG files are accepted.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large — maximum 10 MB.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: 'The file does not match its declared type.' },
        { status: 400 }
      )
    }

    const storagePath = `${params.caseId}/${docType}-${randomUUID().slice(0, 8)}.${extFromMime(file.type)}`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, { contentType: file.type })
    if (uploadError) throw new Error(uploadError.message)

    const insert: CaseDocInsert = {
      case_id: params.caseId,
      doc_type: docType as DocType,
      storage_path: storagePath,
    }
    const { error: rowError } = await (
      supabase.from('case_documents').insert as unknown as (
        v: CaseDocInsert
      ) => Promise<{ error: { message: string } | null }>
    )(insert)
    if (rowError) throw new Error(rowError.message)

    return NextResponse.json({ added: true })
  } catch (error) {
    console.error('[case-documents] Error:', error)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}
