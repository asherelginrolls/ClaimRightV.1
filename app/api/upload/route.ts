import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServiceClient, type Database } from '@/lib/supabase'
import { extractTextFromDocument } from '@/lib/ocr'
import { randomUUID } from 'crypto'
import type { UploadResponse, ApiError } from '@/types/api'
import type { DocType } from '@/types/case'
import { rateLimitUpload } from '@/lib/rate-limit'
import { verifyTurnstileToken } from '@/lib/turnstile'

// Node runtime (Buffer + Anthropic SDK + waitUntil). maxDuration must cover the
// background OCR that runs AFTER the response is sent (Fluid Compute allows up
// to 300; 60 is plenty with parallel OCR of ≤5 docs).
export const runtime = 'nodejs'
export const maxDuration = 60

type CaseInsert = Database['public']['Tables']['cases']['Insert']
type CaseDocInsert = Database['public']['Tables']['case_documents']['Insert']
type SupabaseClient = ReturnType<typeof createServiceClient>

interface OcrDocMeta {
  storagePath: string
  buffer: Buffer
  mimeType: string
}

// Background OCR: runs after the upload response is sent (Next 14.2 has no
// after(), so we use Vercel waitUntil). OCRs every doc in PARALLEL and caches
// the text on case_documents.ocr_text, keyed by storage_path (unique per doc).
// Idempotent: a doc that already has ocr_text is skipped, and each doc is
// isolated in its own try/catch so one failure never blocks the others. By the
// time the user reaches Screen 3, the text is usually already cached, so
// /api/analyse does ZERO Vision OCR.
async function ocrDocsInBackground(docMeta: OcrDocMeta[]): Promise<void> {
  const supabase: SupabaseClient = createServiceClient()
  await Promise.all(
    docMeta.map(async (d) => {
      try {
        const { data: existing } = await (
          supabase
            .from('case_documents')
            .select('ocr_text')
            .eq('storage_path', d.storagePath)
            .single() as unknown as Promise<{ data: { ocr_text: string | null } | null }>
        )
        if (existing?.ocr_text && existing.ocr_text.trim().length > 0) {
          console.info('[upload] ocr-bg skip (cached) ' + d.storagePath)
          return
        }

        console.info('[upload] ocr-bg start ' + d.storagePath)
        const text = await extractTextFromDocument(d.buffer, d.mimeType)
        console.info('[upload] ocr-bg end ' + d.storagePath + ' len=' + text.length)

        if (text.trim().length > 0) {
          await (
            supabase.from('case_documents').update as unknown as (
              v: { ocr_text: string }
            ) => {
              eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
            }
          )({ ocr_text: text }).eq('storage_path', d.storagePath)
        }
      } catch (err) {
        console.warn(
          '[upload] ocr-bg failed ' + d.storagePath + ':',
          err instanceof Error ? err.message : String(err)
        )
      }
    })
  )
}

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const ALLOWED_DOC_TYPES = new Set<DocType>([
  'rejection_letter', 'policy_document', 'hospital_bills',
  'discharge_summary', 'prior_correspondence', 'other',
])
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_FILES = 5

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false
  if (mimeType === 'application/pdf') {
    // %PDF
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
  }
  if (mimeType === 'image/png') {
    // \x89PNG
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  }
  if (mimeType === 'image/jpeg') {
    // \xFF\xD8
    return buffer[0] === 0xff && buffer[1] === 0xd8
  }
  return false
}

function extFromMime(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType === 'image/png') return 'png'
  return 'jpg'
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<UploadResponse | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  const rateLimitResult = await rateLimitUpload(ip)
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: rateLimitResult.reason ?? 'Too many requests.' }, { status: 429 })
  }

  try {
    const formData = await request.formData()
    const email = formData.get('email') as string | null
    const files = formData.getAll('files') as File[]
    const docTypes = formData.getAll('doc_types') as string[]
    const turnstileToken = formData.get('turnstile_token') as string | null

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded.' }, { status: 400 })
    }
    if (files.length !== docTypes.length) {
      return NextResponse.json({ error: 'Mismatched files and doc_types.' }, { status: 400 })
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_FILES} files per case.` }, { status: 400 })
    }

    // Validate doc_types
    for (const dt of docTypes) {
      if (!ALLOWED_DOC_TYPES.has(dt as DocType)) {
        return NextResponse.json({ error: `Invalid doc_type: ${dt}` }, { status: 400 })
      }
    }

    // Require rejection_letter
    if (!docTypes.includes('rejection_letter')) {
      return NextResponse.json({ error: 'A rejection letter is required.' }, { status: 400 })
    }

    // Verify Turnstile (skipped in dev when TURNSTILE_SECRET_KEY is unset)
    const turnstileOk = await verifyTurnstileToken(turnstileToken ?? '')
    if (!turnstileOk) {
      return NextResponse.json({ error: 'Bot check failed. Please try again.' }, { status: 400 })
    }

    // Server-side email format validation
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    // Validate each file and read buffers
    const fileBuffers: Buffer[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: `File "${file.name}": only PDF, JPG, and PNG files are accepted.` },
          { status: 400 }
        )
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: `File "${file.name}" is too large. Maximum size is 10 MB.` },
          { status: 400 }
        )
      }

      const buffer = Buffer.from(await file.arrayBuffer())

      if (!validateMagicBytes(buffer, file.type)) {
        return NextResponse.json(
          { error: `File "${file.name}" does not match its declared type. Please upload a genuine PDF, JPG, or PNG.` },
          { status: 400 }
        )
      }

      fileBuffers.push(buffer)
    }

    const supabase = createServiceClient()
    const caseId = randomUUID()

    // Upload all files to storage in parallel
    const storagePaths: string[] = []
    await Promise.all(
      files.map(async (file, i) => {
        const docType = docTypes[i] as DocType
        const ext = extFromMime(file.type)
        const storagePath = `${caseId}/${docType}-${randomUUID().slice(0, 8)}.${ext}`
        storagePaths[i] = storagePath

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(storagePath, fileBuffers[i], { contentType: file.type })

        if (uploadError) {
          throw new Error(`Storage upload failed for ${docType}: ${uploadError.message}`)
        }
      })
    )

    // cases.document_path mirrors the rejection_letter path for backwards compat
    const rejectionIdx = docTypes.indexOf('rejection_letter')
    const rejectionLetterPath = storagePaths[rejectionIdx]

    const newCase: CaseInsert = {
      id: caseId,
      email: email ?? null,
      status: 'uploaded',
      document_path: rejectionLetterPath,
    }
    // Type cast needed: supabase-js generic resolution issue with custom Database types
    const { error: caseError } = await (
      supabase.from('cases').insert as unknown as (
        values: CaseInsert
      ) => Promise<{ data: null; error: { message: string } | null }>
    )(newCase)

    if (caseError) {
      throw new Error(`Case creation failed: ${caseError.message}`)
    }

    // Insert one case_documents row per file in parallel
    const docInserts: CaseDocInsert[] = files.map((_, i) => ({
      case_id: caseId,
      doc_type: docTypes[i] as DocType,
      storage_path: storagePaths[i],
    }))

    const { error: docsError } = await (
      supabase.from('case_documents').insert as unknown as (
        values: CaseDocInsert[]
      ) => Promise<{ data: null; error: { message: string } | null }>
    )(docInserts)

    if (docsError) {
      throw new Error(`case_documents insert failed: ${docsError.message}`)
    }

    // Kick off OCR in the background using the in-memory buffers (no re-download).
    // The response returns immediately; OCR + caching run after it is sent.
    // waitUntil keeps the serverless function alive until OCR finishes on Vercel;
    // off-Vercel (e.g. local `next dev`) there is no request context, so we fall
    // back to fire-and-forget — the dev process stays alive long enough to finish.
    const docMeta: OcrDocMeta[] = files.map((file, i) => ({
      storagePath: storagePaths[i],
      buffer: fileBuffers[i],
      mimeType: file.type,
    }))
    const ocrPromise = ocrDocsInBackground(docMeta)
    try {
      waitUntil(ocrPromise)
    } catch {
      void ocrPromise
    }

    return NextResponse.json({ caseId, message: 'Documents uploaded. Redirecting to analysis...' })
  } catch (error) {
    console.error('[upload] Error:', error)
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 }
    )
  }
}
