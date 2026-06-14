import { createServiceClient, type Database } from '@/lib/supabase'
import { extractTextFromDocument } from '@/lib/ocr'

type CaseDocRow = Database['public']['Tables']['case_documents']['Row']
type SupabaseClient = ReturnType<typeof createServiceClient>

// Type cast needed: supabase-js generic resolution issue with custom Database types
type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function updateCaseDoc(
  supabase: SupabaseClient,
  values: { ocr_text?: string | null; extracted_facts?: Record<string, unknown> | null }
): UpdateQuery {
  return (
    supabase.from('case_documents').update as unknown as (v: typeof values) => UpdateQuery
  )(values)
}

export function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  return ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg'
}

// Download a file from Supabase Storage and OCR it. Returns '' on any failure
// (callers treat empty text as "no usable content" and fall back gracefully).
export async function downloadAndOcr(
  supabase: SupabaseClient,
  storagePath: string
): Promise<string> {
  const { data: fileData, error } = await supabase.storage
    .from('documents')
    .download(storagePath)
  if (error || !fileData) return ''
  const buffer = Buffer.from(await fileData.arrayBuffer())
  return extractTextFromDocument(buffer, mimeFromPath(storagePath))
}

// OCRs every doc in `docs` that does not yet have usable `ocr_text`, IN PARALLEL,
// writes the text back to case_documents.ocr_text, and mutates each row's
// ocr_text in place so callers can read it without re-querying. Idempotent:
// docs that already have text are skipped (no download, no LLM call).
//
// Correctness contract: this is best-effort speed. A doc that fails OCR keeps
// ocr_text = null/empty, and downstream code (analyse) treats that as "no text"
// and proceeds. The background pre-warm at upload and the inline pass in
// /analyse both call this, so a dead background job only costs latency.
export async function ensureOcrForDocs(
  supabase: SupabaseClient,
  docs: CaseDocRow[]
): Promise<CaseDocRow[]> {
  const needsOcr = docs.filter((d) => !d.ocr_text || d.ocr_text.trim().length === 0)
  if (needsOcr.length === 0) return docs

  await Promise.all(
    needsOcr.map(async (doc) => {
      try {
        console.info(`[ocr-docs] start type=${doc.doc_type}`)
        const text = await downloadAndOcr(supabase, doc.storage_path)
        console.info(`[ocr-docs] end type=${doc.doc_type} len=${text.length}`)
        if (text.trim().length > 0) {
          doc.ocr_text = text
          await updateCaseDoc(supabase, { ocr_text: text }).eq('id', doc.id)
        }
      } catch (err) {
        console.warn(
          `[ocr-docs] OCR failed type=${doc.doc_type}:`,
          err instanceof Error ? err.message : String(err)
        )
        // Leave ocr_text empty; downstream proceeds without this doc.
      }
    })
  )

  return docs
}

// Load all case_documents for a case and OCR any missing ones in parallel.
// Used by the upload route's background pre-warm (via next/server `after`).
// Idempotent and self-contained — safe to call any number of times.
export async function ocrCaseDocuments(
  supabase: SupabaseClient,
  caseId: string
): Promise<void> {
  const { data: allDocs } = await (
    supabase
      .from('case_documents')
      .select('*')
      .eq('case_id', caseId) as unknown as Promise<{ data: CaseDocRow[] | null }>
  )
  const docs = allDocs ?? []
  if (docs.length === 0) return
  await ensureOcrForDocs(supabase, docs)
}
