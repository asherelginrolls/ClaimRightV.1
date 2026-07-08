// Sarvam Document Intelligence (Sarvam Vision) — Indian-language + English OCR
// for PDFs via the official job-based flow: create job → upload → start → poll
// → download ZIP → join text blocks in reading order.
//
// The legacy `v1/vision/ocr` endpoint this file used to call has never existed
// in production (404) — every PDF silently fell through to Haiku Vision.
// Verified 2026-07-08: this job flow completes the 2-page test rejection
// letter in ~14s with clean block text and preserved tables.

import { SarvamAIClient } from 'sarvamai'
import AdmZip from 'adm-zip'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { unlink } from 'fs/promises'

// Overall budget for the whole job flow. The analyse route runs OCR for all
// docs in parallel inside a 300s function; a slow Sarvam queue must degrade to
// the Haiku fallback, not eat the request.
const SARVAM_BUDGET_MS = 90_000

interface PageBlock {
  text?: string
  reading_order?: number
}

interface PageMetadata {
  page_num?: number
  blocks?: PageBlock[]
}

function extractTextFromZip(zipPath: string): string {
  const zip = new AdmZip(zipPath)
  const pages = zip
    .getEntries()
    .filter((e) => /metadata\/page_\d+\.json$/.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName))

  const pageTexts: string[] = []
  for (const page of pages) {
    const parsed = JSON.parse(page.getData().toString('utf-8')) as PageMetadata
    const blocks = (parsed.blocks ?? [])
      .slice()
      .sort((a, b) => (a.reading_order ?? 0) - (b.reading_order ?? 0))
    pageTexts.push(
      blocks
        .map((b) => b.text ?? '')
        .filter((t) => t.trim().length > 0)
        .join('\n')
    )
  }
  return pageTexts.join('\n\n').trim()
}

async function runJobFlow(pdfBuffer: Buffer): Promise<string> {
  const client = new SarvamAIClient({
    apiSubscriptionKey: process.env.SARVAM_API_KEY!,
  })

  // 'en-IN' covers the common case (insurer letters are mostly English);
  // Sarvam still transcribes mixed Indic content, and the Haiku fallback
  // catches anything it mangles badly enough to produce empty text.
  const job = await client.documentIntelligence.createJob({
    language: 'en-IN',
    outputFormat: 'md',
    pollingIntervalMs: 2000,
    maxPollingAttempts: 40, // 80s cap inside the overall budget race
  })

  await job.uploadFile(new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }))
  await job.start()
  const status = await job.waitUntilComplete()
  if (status.job_state !== 'Completed' && status.job_state !== 'PartiallyCompleted') {
    throw new Error(`Sarvam job ended in state ${status.job_state}: ${status.error_message ?? ''}`)
  }

  const zipPath = join(tmpdir(), `sarvam-${randomUUID()}.zip`)
  try {
    await job.downloadOutput(zipPath)
    return extractTextFromZip(zipPath)
  } finally {
    await unlink(zipPath).catch(() => {})
  }
}

/**
 * OCR a PDF through Sarvam Document Intelligence. Throws on any failure or
 * when the overall budget is exceeded — callers fall back to Haiku Vision.
 */
export async function sarvamOcrPdf(pdfBuffer: Buffer): Promise<string> {
  if (!process.env.SARVAM_API_KEY) {
    throw new Error('SARVAM_API_KEY not configured')
  }
  return Promise.race([
    runJobFlow(pdfBuffer),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Sarvam OCR exceeded ${SARVAM_BUDGET_MS / 1000}s budget`)),
        SARVAM_BUDGET_MS
      )
    ),
  ])
}
