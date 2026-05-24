import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import { extractTextFromDocument } from '@/lib/ocr'
import { haiku } from '@/lib/claude'
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from '@/prompts/extraction'
import { retrieveForCase } from '@/lib/retrieval'
import { calculateFightabilityScore, computeNumericScore } from '@/lib/scoring'
import { ExtractedFactsSchema } from '@/types/api'
import type { AnalyseResponse, ApiError } from '@/types/api'
import type { RejectionCategory, EvidenceSummary } from '@/types/case'
import { rateLimit } from '@/lib/rate-limit'

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseUpdate = Database['public']['Tables']['cases']['Update']
type CaseDocRow = Database['public']['Tables']['case_documents']['Row']

// Type cast needed: supabase-js generic resolution issue with custom Database types
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

const DOC_TYPE_HEADERS: Record<string, string> = {
  rejection_letter: 'Rejection Letter',
  policy_document: 'Policy Document',
  hospital_bills: 'Hospital Bills',
  discharge_summary: 'Discharge Summary',
  prior_correspondence: 'Prior Correspondence',
  other: 'Other Document',
}

async function buildCombinedDocumentText(
  supabase: ReturnType<typeof createServiceClient>,
  caseId: string,
  fallbackDocumentPath: string | null
): Promise<string> {
  // Try fetching case_documents rows first
  const { data: docs } = await (
    supabase
      .from('case_documents')
      .select('*')
      .eq('case_id', caseId)
      .order('uploaded_at', { ascending: true }) as unknown as Promise<{
        data: CaseDocRow[] | null
      }>
  )

  if (docs && docs.length > 0) {
    // OCR each document SEQUENTIALLY to avoid Anthropic token rate limits.
    // Parallel OCR of 5 large PDFs can spike >50K input tokens/min (free-tier limit).
    const ocrResults: Array<{ doc: CaseDocRow; text: string }> = []
    for (const doc of docs) {
      try {
        const { data: fileData, error: fileError } = await supabase.storage
          .from('documents')
          .download(doc.storage_path)

        if (fileError || !fileData) {
          console.warn(`[analyse] Could not download ${doc.doc_type} (${doc.storage_path})`)
          ocrResults.push({ doc, text: '' })
          continue
        }

        const buffer = Buffer.from(await fileData.arrayBuffer())
        const ext = doc.storage_path.split('.').pop()?.toLowerCase()
        const mimeType =
          ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg'

        const text = await extractTextFromDocument(buffer, mimeType)

        // Store ocr_text in case_documents for future reference
        await (
          supabase.from('case_documents').update as unknown as (
            values: { ocr_text: string | null }
          ) => { eq: (col: string, val: string) => Promise<{ error: unknown }> }
        )({ ocr_text: text }).eq('id', doc.id)

        ocrResults.push({ doc, text })
      } catch (ocrErr) {
        console.warn(`[analyse] OCR failed for ${doc.doc_type}:`, ocrErr instanceof Error ? ocrErr.message : String(ocrErr))
        ocrResults.push({ doc, text: '' })
      }
    }

    // Concatenate with doc-type headers; skip empty results
    const sections = ocrResults
      .filter(({ text }) => text.trim().length > 0)
      .map(({ doc, text }) => {
        const header = DOC_TYPE_HEADERS[doc.doc_type] ?? 'Document'
        return `### ${header}\n${text}`
      })

    return sections.join('\n\n')
  }

  // Backwards compat: no case_documents rows — fall back to cases.document_path
  if (!fallbackDocumentPath) return ''

  const { data: fileData, error: fileError } = await supabase.storage
    .from('documents')
    .download(fallbackDocumentPath)

  if (fileError || !fileData) return ''

  const buffer = Buffer.from(await fileData.arrayBuffer())
  const ext = fallbackDocumentPath.split('.').pop()?.toLowerCase()
  const mimeType =
    ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg'

  return extractTextFromDocument(buffer, mimeType)
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<AnalyseResponse | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { success } = await rateLimit(`analyse:${ip}`, { maxRequests: 10, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute before trying again.' },
      { status: 429 }
    )
  }

  const { searchParams } = new URL(request.url)
  const caseId = searchParams.get('caseId')

  if (!caseId) {
    return NextResponse.json({ error: 'caseId is required.' }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()

    const { data: rawCase, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single()

    if (caseError || !rawCase) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
    }

    const caseRow = rawCase as CaseRow

    // Return cached result if already analysed
    if (caseRow.status !== 'uploaded') {
      const cached = caseRow as typeof caseRow & {
        fightability_numeric: number | null
        evidence_summaries: EvidenceSummary[] | null
      }
      return NextResponse.json({
        caseId,
        insurer: caseRow.insurer,
        claimAmount: caseRow.claim_amount,
        rejectionReasonCategory: caseRow.rejection_reason_category as RejectionCategory | null,
        fightabilityScore: caseRow.fightability_score ?? 'low',
        fightabilityReasons: caseRow.fightability_reasons ?? [],
        fightabilityNumeric: cached.fightability_numeric ?? 40,
        evidenceSummaries: cached.evidence_summaries ?? [],
        regulationMatchCount: (cached.evidence_summaries ?? []).filter((e) => e.tier === 1).length,
        precedentMatchCount: (cached.evidence_summaries ?? []).filter((e) => e.tier === 2).length,
      })
    }

    // OCR all documents (multi-doc aware, backwards compatible)
    const documentText = await buildCombinedDocumentText(
      supabase,
      caseId,
      caseRow.document_path
    )

    if (!documentText || documentText.trim().length < 50) {
      await typedUpdate(supabase, {
        status: 'analysed',
        rejection_reason_category: 'other',
        fightability_score: 'low',
        fightability_reasons: [{
          reason: 'Could not extract enough text from your document. Please ensure the file is clear and readable.',
          citation: null,
        }],
      }).eq('id', caseId)

      return NextResponse.json({
        caseId,
        insurer: null,
        claimAmount: null,
        rejectionReasonCategory: 'other',
        fightabilityScore: 'low',
        fightabilityReasons: [{ reason: 'Could not extract enough text from your document. Please ensure the file is clear and readable.', citation: null }],
        fightabilityNumeric: 5,
        evidenceSummaries: [],
        regulationMatchCount: 0,
        precedentMatchCount: 0,
      })
    }

    // Claude Haiku extraction — wrapped in try/catch so Claude downtime doesn't block checkout
    const claudeFallbackReasons = [{
      reason: 'Document received. Detailed analysis temporarily unavailable — please refresh in 2 minutes.',
      citation: null,
    }]

    let extractedFacts: {
      insurer: string | null
      claim_amount: number | null
      rejection_date: string | null
      rejection_reason_raw: string | null
      rejection_reason_category: 'pre_existing_condition' | 'policy_exclusion' | 'documentation_incomplete' | 'non_disclosure' | 'waiting_period' | 'cashless_denial' | 'experimental_treatment' | 'fraud_suspected' | 'other'
      documents_requested_count: number | null
      policy_age_months: number | null
      policy_type: 'individual' | 'family_floater' | 'group' | 'government_scheme' | 'unknown'
      rejection_reason_confidence: number
    }

    try {
      const extraction = await haiku.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: EXTRACTION_USER_PROMPT(documentText) }],
      })

      const rawJson =
        extraction.content[0]?.type === 'text' ? extraction.content[0].text : '{}'
      const cleanJson = rawJson
        .replace(/```json\n?/g, '')
        .replace(/```/g, '')
        .trim()

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(cleanJson)
      } catch {
        console.error('[analyse] Haiku returned non-JSON, length:', cleanJson.length)
        parsedJson = {}
      }

      const parseResult = ExtractedFactsSchema.safeParse(parsedJson)
      if (!parseResult.success) {
        console.error('[analyse] Extraction schema mismatch:', parseResult.error.issues.length, 'issues')
      }
      extractedFacts = parseResult.success
        ? parseResult.data
        : {
            insurer: null,
            claim_amount: null,
            rejection_date: null,
            rejection_reason_raw: null,
            rejection_reason_category: 'other' as const,
            documents_requested_count: null,
            policy_age_months: null,
            policy_type: 'unknown' as const,
            rejection_reason_confidence: 0,
          }
    } catch (claudeError) {
      // Claude API down — return medium score so user can still proceed to payment
      console.error('[analyse] Claude API unavailable:', claudeError instanceof Error ? claudeError.message : String(claudeError))
      await typedUpdate(supabase, {
        status: 'analysed',
        rejection_reason_category: 'other',
        fightability_score: 'medium',
        fightability_reasons: claudeFallbackReasons,
      }).eq('id', caseId)
      return NextResponse.json({
        caseId,
        insurer: null,
        claimAmount: null,
        rejectionReasonCategory: 'other' as RejectionCategory,
        fightabilityScore: 'medium' as const,
        fightabilityReasons: claudeFallbackReasons,
        fightabilityNumeric: 40,
        evidenceSummaries: [],
        regulationMatchCount: 0,
        precedentMatchCount: 0,
      })
    }

    // Not-a-rejection-letter detection
    if (
      extractedFacts.rejection_reason_category === 'other' &&
      extractedFacts.rejection_reason_confidence < 0.3
    ) {
      return NextResponse.json(
        {
          error:
            "This doesn't appear to be a health insurance rejection letter. Please upload the rejection letter you received from your insurer.",
        },
        { status: 400 }
      )
    }

    // KB retrieval
    const retrievalResult = await retrieveForCase({
      insurerName: extractedFacts.insurer,
      rejectionReasonRaw: extractedFacts.rejection_reason_raw,
      rejectionReasonCategory: extractedFacts.rejection_reason_category,
      claimAmount: extractedFacts.claim_amount,
    })

    // Fightability scoring
    const { score, reasons } = calculateFightabilityScore(extractedFacts, retrievalResult)
    const numericScore = computeNumericScore(
      retrievalResult,
      extractedFacts.rejection_reason_category,
      extractedFacts.policy_age_months
    )

    // Generate plain-English evidence explainers for top-3 chunks (single Haiku call)
    let evidenceSummaries: EvidenceSummary[] = []
    if (retrievalResult.chunks.length > 0) {
      try {
        const chunksForExplainer = retrievalResult.chunks.slice(0, 3)
        const explainerPrompt = chunksForExplainer
          .map(
            (c, i) =>
              `Chunk ${i + 1} — "${c.source_title}${c.section_number ? ` §${c.section_number}` : ''}":\n${c.content.slice(0, 600)}`
          )
          .join('\n\n---\n\n')

        const explainerMsg = await haiku.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system:
            'You are a plain-English summariser for Indian insurance regulations. For each numbered chunk below, write exactly one sentence (under 20 words) explaining what rule it contains and why it matters to a policyholder. Respond with a JSON array of strings only, e.g. ["sentence 1","sentence 2"]. No other text.',
          messages: [{ role: 'user', content: explainerPrompt }],
        })

        const rawExplainers =
          explainerMsg.content[0]?.type === 'text' ? explainerMsg.content[0].text.trim() : '[]'
        const cleanExplainers = rawExplainers
          .replace(/```json\n?/g, '')
          .replace(/```/g, '')
          .trim()

        let explainerArr: string[] = []
        try {
          const parsed = JSON.parse(cleanExplainers)
          if (Array.isArray(parsed)) explainerArr = parsed.map(String)
        } catch {
          // ignore — leave evidenceSummaries empty
        }

        evidenceSummaries = chunksForExplainer.map((c, i) => ({
          source_title: c.source_title,
          section_number: c.section_number,
          tier: c.tier,
          similarity: c.similarity,
          explainer: explainerArr[i] ?? `Relevant regulation from ${c.source_title}.`,
        }))
      } catch (explainerErr) {
        console.error('[analyse] Evidence explainer call failed:', explainerErr instanceof Error ? explainerErr.message : String(explainerErr))
        // Non-fatal — proceed with empty summaries
        evidenceSummaries = retrievalResult.chunks.slice(0, 3).map((c) => ({
          source_title: c.source_title,
          section_number: c.section_number,
          tier: c.tier,
          similarity: c.similarity,
          explainer: `Relevant regulation from ${c.source_title}.`,
        }))
      }
    }

    // claim_amount: extraction returns rupees → convert to paise for storage
    const claimAmountPaise =
      extractedFacts.claim_amount !== null ? extractedFacts.claim_amount * 100 : null

    const updatePayload = {
      status: 'analysed' as const,
      insurer: extractedFacts.insurer,
      claim_amount: claimAmountPaise,
      rejection_reason_raw: extractedFacts.rejection_reason_raw,
      rejection_reason_category: extractedFacts.rejection_reason_category,
      rejection_date: extractedFacts.rejection_date,
      fightability_score: score,
      fightability_reasons: reasons,
      fightability_numeric: numericScore,
      evidence_summaries: evidenceSummaries,
    }

    await typedUpdate(supabase, updatePayload).eq('id', caseId)

    const regulationMatchCount = evidenceSummaries.filter((e) => e.tier === 1).length
    const precedentMatchCount = evidenceSummaries.filter((e) => e.tier === 2).length

    return NextResponse.json({
      caseId,
      insurer: extractedFacts.insurer,
      // Return to client in rupees (the value extracted from the letter)
      claimAmount: extractedFacts.claim_amount,
      rejectionReasonCategory: extractedFacts.rejection_reason_category,
      fightabilityScore: score,
      fightabilityReasons: reasons,
      fightabilityNumeric: numericScore,
      evidenceSummaries,
      regulationMatchCount,
      precedentMatchCount,
    })
  } catch (error) {
    console.error('[analyse] Error:', error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: 'Analysis failed. Please try again.' },
      { status: 500 }
    )
  }
}
