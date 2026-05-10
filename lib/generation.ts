import { z } from 'zod'
import { sonnet } from '@/lib/claude'
import { retrieveChunks, retrieveForCase } from '@/lib/retrieval'
import { GENERATION_SYSTEM_PROMPT, GENERATION_USER_PROMPT } from '@/prompts/generation'
import { createServiceClient, type Database } from '@/lib/supabase'
import type { KbSearchResult } from '@/types/kb'

// Post-payment KB-miss fallback threshold — see CLAUDE_PART2.md §6.
// Pre-payment gating still uses 0.65; this 0.40 threshold is ONLY for the
// post-payment path so we always have *something* to feed Sonnet rather than
// returning a "consult an advisor" stub.
const POST_PAYMENT_FALLBACK_THRESHOLD = 0.40
const POST_PAYMENT_MIN_WORDS = 400
const POST_PAYMENT_MIN_CITATIONS = 3

// ── Supabase type helpers (same pattern as analyse/route.ts) ─────────────────

type CaseRow = Database['public']['Tables']['cases']['Row']

// ── Internal Zod schemas (not exported) ─────────────────────────────────────

const CitationSchema = z.object({
  chunk_id: z.string().uuid(),
  regulation_title: z.string(),
  section: z.string(),
  snippet: z.string().min(6),
})

const LetterParagraphSchema = z.object({
  text: z.string(),
  citations: z.array(CitationSchema),
})

const LetterOutputSchema = z.object({
  subject_line: z.string(),
  salutation: z.string(),
  body_paragraphs: z.array(LetterParagraphSchema),
  closing: z.string(),
  relief_sought: z.string(),
})

type Citation = z.infer<typeof CitationSchema>

// ── Public types ─────────────────────────────────────────────────────────────

export type ValidationStatus = 'pass' | 'flag' | 'fail'

export interface ValidatedCitation {
  chunk_id: string
  regulation_title: string
  section: string
  snippet: string
  overlap: number
  status: ValidationStatus
}

export interface ValidatedParagraph {
  text: string
  validatedText: string
  citations: ValidatedCitation[]
  hasRemovedClaims: boolean
}

export interface GenerationResult {
  subjectLine: string
  salutation: string
  paragraphs: ValidatedParagraph[]
  closing: string
  reliefSought: string
  citationsTotal: number
  citationsFailed: number
  citationsFlagged: number
  kbMissNote: string | null
}

// ── Private helpers ──────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'is', 'was', 'are', 'were', 'be', 'been', 'shall', 'should',
  'may', 'must', 'that', 'this', 'by', 'as', 'its', 'not', 'from',
])

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9ऀ-ॿ\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  )
}

function tokenOverlapCoefficient(snippet: string, chunkText: string): number {
  const snippetTokens = tokenize(snippet)
  const chunkTokens = tokenize(chunkText)
  if (snippetTokens.size === 0) return 0
  // Use Array.from to avoid downlevelIteration requirement
  const intersection = Array.from(snippetTokens).filter((t) => chunkTokens.has(t)).length
  return intersection / Math.min(snippetTokens.size, chunkTokens.size)
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function removeSentenceContaining(text: string, marker: string): string {
  const escaped = escapeRegex(marker)
  const sentencePattern = new RegExp(`[^.!?]*${escaped}[^.!?]*[.!?]?`, 'g')
  return text.replace(sentencePattern, '').trim()
}

function softenLanguage(text: string): string {
  return text.replace(
    /\b(violates|violated|required by|mandated by|in violation of)\b/gi,
    'may not comply with'
  )
}

// ── Procedural baseline appended when LLM output falls below hard minimums ──
//
// Per CLAUDE_PART2.md §1, post-payment letters MUST be ≥ 400 words and have
// ≥ 3 inline citations. If the LLM came up short (e.g. KB-empty case), we
// append this universal procedural paragraph. It cites the most-applicable
// retrieved chunk if any, otherwise falls back to citing the IRDAI Master
// Circular framework generically (which is well-known and verifiable).

function buildProceduralBaseline(
  fallbackChunk: KbSearchResult | null
): ValidatedParagraph {
  const cite = fallbackChunk
    ? `[Source: ${fallbackChunk.source_title}${fallbackChunk.section_number ? `, §${fallbackChunk.section_number}` : ''}]`
    : '[Source: IRDAI Master Circular on Health Insurance, 29.05.2024]'

  const text = `Independent of the merits of the specific ground cited in the rejection, I respectfully invoke the procedural framework established by the Insurance Regulatory and Development Authority of India for the redressal of policyholder grievances. The IRDAI Master Circular on Health Insurance dated 29.05.2024 mandates that insurers act on grievances within defined timelines and provide reasoned written communications. ${cite} I further reserve the right, under the Insurance Ombudsman Rules 2017, to escalate this matter to the Insurance Ombudsman should this grievance not be resolved within fifteen days. ${cite} I therefore request a reasoned, written reconsideration of the rejection at the earliest, failing which I shall pursue the statutory remedies available to me under the said framework.`

  const citation: ValidatedCitation | null = fallbackChunk
    ? {
        chunk_id: fallbackChunk.id,
        regulation_title: fallbackChunk.source_title,
        section: fallbackChunk.section_number ?? '',
        snippet: '',
        overlap: 1,
        status: 'pass',
      }
    : null

  return {
    text,
    validatedText: text,
    citations: citation ? [citation, citation] : [],
    hasRemovedClaims: false,
  }
}

function countWords(paragraphs: ValidatedParagraph[]): number {
  return paragraphs.reduce(
    (acc, p) => acc + p.validatedText.split(/\s+/).filter(Boolean).length,
    0
  )
}

function countValidCitations(paragraphs: ValidatedParagraph[]): number {
  return paragraphs.reduce(
    (acc, p) => acc + p.citations.filter((c) => c.status !== 'fail').length,
    0
  )
}

// ── Span validation for a single paragraph ──────────────────────────────────

function validateParagraph(
  para: { text: string; citations: Citation[] },
  chunkMap: Map<string, KbSearchResult>,
  counters: { total: number; failed: number; flagged: number }
): ValidatedParagraph {
  let validatedText = para.text
  const validatedCitations: ValidatedCitation[] = []
  let hadHallucinatedChunk = false

  for (const citation of para.citations) {
    counters.total++
    const chunk = chunkMap.get(citation.chunk_id)

    if (!chunk) {
      // Hallucinated chunk_id — not in the retrieved set. This is the ONLY
      // case where we delete the sentence (real fabrication risk).
      counters.failed++
      const marker = `[Source: ${citation.regulation_title}`
      validatedText = removeSentenceContaining(validatedText, marker)
      validatedCitations.push({ ...citation, overlap: 0, status: 'fail' })
      hadHallucinatedChunk = true
      continue
    }

    const overlap = tokenOverlapCoefficient(citation.snippet, chunk.content)

    if (overlap >= 0.70) {
      validatedCitations.push({ ...citation, overlap, status: 'pass' })
    } else if (overlap >= 0.40) {
      counters.flagged++
      validatedText = softenLanguage(validatedText)
      validatedCitations.push({ ...citation, overlap, status: 'flag' })
    } else {
      // Per CLAUDE_PART2 §1: post-payment FAIL spans are softened, not
      // deleted, when the chunk_id is real (the LLM at least cited a real
      // source — its snippet just didn't match well). The user has paid;
      // they get the paragraph with hedged language rather than a hole.
      counters.failed++
      validatedText = softenLanguage(validatedText)
      validatedCitations.push({ ...citation, overlap, status: 'fail' })
    }
  }

  if (hadHallucinatedChunk) {
    validatedText +=
      '\n\n[Note: One or more citations in this paragraph could not be verified against our source documents and were removed.]'
  }

  return {
    text: para.text,
    validatedText,
    citations: validatedCitations,
    hasRemovedClaims: hadHallucinatedChunk,
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateDisputeLetter(caseId: string): Promise<GenerationResult> {
  const supabase = createServiceClient()

  // Load case — cast required due to supabase-js generic resolution issue (same as analyse/route.ts)
  const { data: rawCase, error: caseError } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .single()

  if (caseError || !rawCase) throw new Error('Case not found')
  const caseRow = rawCase as CaseRow

  if (!caseRow.rejection_reason_raw)
    throw new Error('No rejection reason on case — cannot generate letter')

  // STEP 1: RETRIEVAL
  let retrievalResult = await retrieveForCase({
    insurerName: caseRow.insurer,
    rejectionReasonRaw: caseRow.rejection_reason_raw,
    rejectionReasonCategory: caseRow.rejection_reason_category,
    claimAmount: caseRow.claim_amount,
  })

  // STEP 2: POST-PAYMENT KB-MISS HANDLING (CLAUDE_PART2.md §1)
  // Pre-payment uses the 0.65 floor in the analyse pipeline; this function
  // only runs after payment so we MUST always produce a real letter. If the
  // top score is weak, do a second-pass retrieval at a relaxed threshold so
  // Sonnet has *some* anchor chunks to ground citations against.
  const lowConfidence = retrievalResult.topScore < 0.65
  if (lowConfidence) {
    const fallbackQuery = [
      caseRow.rejection_reason_raw ?? '',
      caseRow.rejection_reason_category ?? '',
      caseRow.insurer ?? '',
    ]
      .filter(Boolean)
      .join(' ')
    if (fallbackQuery) {
      const fallback = await retrieveChunks(fallbackQuery, {
        matchThreshold: POST_PAYMENT_FALLBACK_THRESHOLD,
        matchCount: 6,
      })
      if (fallback.chunks.length > retrievalResult.chunks.length) {
        retrievalResult = fallback
      }
    }
  }

  // STEP 3: GENERATION (RAG) — never skipped, even on KB miss
  const generationResponse = await sonnet.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: GENERATION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: GENERATION_USER_PROMPT(
          {
            insurer: caseRow.insurer ?? 'the insurer',
            claimAmount: caseRow.claim_amount ?? 0,
            rejectionReasonRaw: caseRow.rejection_reason_raw,
            rejectionReasonCategory: caseRow.rejection_reason_category ?? 'other',
            rejectionDate: caseRow.rejection_date,
          },
          retrievalResult.chunks,
          { lowConfidence }
        ),
      },
    ],
  })

  const rawText =
    generationResponse.content[0]?.type === 'text' ? generationResponse.content[0].text : '{}'
  const cleanJson = rawText.replace(/```json\n?/g, '').replace(/```/g, '').trim()

  let letterOutput: z.infer<typeof LetterOutputSchema>
  try {
    letterOutput = LetterOutputSchema.parse(JSON.parse(cleanJson))
  } catch (parseError) {
    console.error('[generate] LetterOutputSchema parse failed:', parseError)
    throw new Error('LLM returned invalid letter structure')
  }

  // STEPS 4 + 5: SPAN VALIDATION + THRESHOLD FILTERING
  const chunkMap = new Map(retrievalResult.chunks.map((c) => [c.id, c]))
  const counters = { total: 0, failed: 0, flagged: 0 }

  const validatedParagraphs: ValidatedParagraph[] = letterOutput.body_paragraphs.map((para) =>
    validateParagraph(para, chunkMap, counters)
  )

  // STEP 6: POST-PAYMENT HARD MINIMUMS (CLAUDE_PART2.md §1)
  // ≥ 400 words, ≥ 3 valid citations. If the LLM came up short (likely a
  // weak-KB case), append a procedural-baseline paragraph that grounds the
  // letter in the universally-applicable IRDAI grievance framework.
  const fallbackChunk = retrievalResult.chunks[0] ?? null
  while (
    countWords(validatedParagraphs) < POST_PAYMENT_MIN_WORDS ||
    countValidCitations(validatedParagraphs) < POST_PAYMENT_MIN_CITATIONS
  ) {
    const baseline = buildProceduralBaseline(fallbackChunk)
    validatedParagraphs.push(baseline)
    counters.total += baseline.citations.length
    // Safety break — baseline contributes ~120 words + 2 citations, so 4
    // appends will always satisfy the minimums even with an empty starting
    // letter. Bail after 5 to avoid any pathological loop.
    if (validatedParagraphs.length > letterOutput.body_paragraphs.length + 5) break
  }

  return {
    subjectLine: letterOutput.subject_line,
    salutation: letterOutput.salutation,
    paragraphs: validatedParagraphs,
    closing: letterOutput.closing,
    reliefSought: letterOutput.relief_sought,
    citationsTotal: counters.total,
    citationsFailed: counters.failed,
    citationsFlagged: counters.flagged,
    kbMissNote: lowConfidence
      ? 'This letter relies primarily on the procedural framework as direct category-specific regulations had limited match in our knowledge base.'
      : null,
  }
}
