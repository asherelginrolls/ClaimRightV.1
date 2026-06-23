import { z } from 'zod'
import { sonnet } from '@/lib/claude'
import { retrieveChunks, retrieveForCase } from '@/lib/retrieval'
import {
  GENERATION_SYSTEM_PROMPT,
  GENERATION_USER_PROMPT,
  LETTER_HEADER_TEMPLATE,
  LETTER_TRI_CLAUSE,
  LETTER_ESCALATION_SENTENCE,
} from '@/prompts/generation'
import {
  CATEGORY_BASELINES,
  getCategoryBaseline,
  type CanonicalCategory,
} from '@/prompts/category-baselines'
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

// ── Internal Zod schemas (exported for test-script + future callers) ────────

export const CitationSchema = z.object({
  chunk_id: z.string().uuid(),
  regulation_title: z.string(),
  section: z.string(),
  snippet: z.string().min(6),
})

export const LetterParagraphSchema = z.object({
  text: z.string(),
  citations: z.array(CitationSchema),
})

export const LetterOutputSchema = z.object({
  subject_line: z.string(),
  salutation: z.string(),
  body_paragraphs: z.array(LetterParagraphSchema),
  closing: z.string(),
  relief_sought: z.string(),
})

export type LetterOutput = z.infer<typeof LetterOutputSchema>
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
  /** Verbatim §2 scaffold blocks — appended/prepended around the LLM body. */
  headerBlock: string
  triClauseBlock: string
  escalationBlock: string
}

export interface CaseFacts {
  insurer: string
  claimAmount: number // in paise
  rejectionReasonRaw: string
  rejectionReasonCategory: CanonicalCategory
  rejectionDate: string | null
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

export function tokenOverlapCoefficient(snippet: string, chunkText: string): number {
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

// Remove the single sentence a failed/hallucinated citation supports — and ONLY
// that sentence — together with its inline [Source: ...] marker.
//
// Convention (see prompts/category-baselines.ts + GENERATION_SYSTEM_PROMPT): the
// inline marker FOLLOWS the sentence it supports, e.g. "Claim. [Source: X, §Y]".
// The previous implementation matched `[^.!?]*<title>[^.!?]*[.!?]?`, but because
// a [Source: ...] marker contains no sentence terminator, the trailing `[^.!?]*`
// ran past the bracket into the NEXT sentence — deleting a legitimate following
// claim, keeping the unsupported one, and orphaning the next claim's real marker.
//
// This version anchors on the [Source: ...] bracket (bounded by ']' so removal
// can never bleed into the next sentence) and consumes the preceding sentence it
// belongs to. Matching tolerates title/section formatting drift: title first,
// then section number, then a snippet-overlap fallback for the case where the
// model omitted the inline marker entirely (so a hallucinated claim can never
// survive silently).
function removeClaimForCitation(
  text: string,
  citation: { regulation_title: string; section: string; snippet: string }
): string {
  const tidy = (s: string): string => s.replace(/\s{2,}/g, ' ').trim()

  const title = escapeRegex(citation.regulation_title.trim())
  if (title) {
    const byTitle = new RegExp(`([^.!?]*[.!?]+\\s*)?\\[Source:[^\\]]*${title}[^\\]]*\\]`, 'i')
    if (byTitle.test(text)) return tidy(text.replace(byTitle, ''))
  }

  const section = escapeRegex(citation.section.trim())
  if (section) {
    const bySection = new RegExp(
      `([^.!?]*[.!?]+\\s*)?\\[Source:[^\\]]*§?\\s*${section}[^\\]]*\\]`,
      'i'
    )
    if (bySection.test(text)) return tidy(text.replace(bySection, ''))
  }

  // Fallback: no locatable [Source: ...] marker for this citation. Drop the
  // sentence whose tokens best overlap the hallucinated snippet.
  const snippetTokens = tokenize(citation.snippet)
  if (snippetTokens.size > 0) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean)
    let bestIdx = -1
    let bestScore = 0
    sentences.forEach((sentence, i) => {
      const sTokens = tokenize(sentence)
      if (sTokens.size === 0) return
      const overlap =
        Array.from(snippetTokens).filter((t) => sTokens.has(t)).length / snippetTokens.size
      if (overlap > bestScore) {
        bestScore = overlap
        bestIdx = i
      }
    })
    if (bestIdx >= 0 && bestScore > 0) {
      sentences.splice(bestIdx, 1)
      return tidy(sentences.join(' '))
    }
  }

  return tidy(text)
}

function softenLanguage(text: string): string {
  return text.replace(
    /\b(violates|violated|required by|mandated by|in violation of)\b/gi,
    'may not comply with'
  )
}

// ── Category-aware procedural baseline (CLAUDE_PART2.md §1) ─────────────────
//
// Appended when the LLM output falls below the post-payment hard minimums
// (≥ 400 words, ≥ 3 inline citations). Pulls a category-specific baseline
// paragraph from prompts/category-baselines.ts. If a Master-Circular chunk is
// present in the retrieved set we cite it with the real chunk_id (status
// 'pass'); otherwise the citation is surfaced inline but flagged in metrics.

function buildProceduralBaseline(
  category: CanonicalCategory,
  retrievedChunks: KbSearchResult[]
): ValidatedParagraph {
  const baseline = getCategoryBaseline(category)
  const text = baseline.baselineParagraph

  // Try to resolve the fallback citation against a retrieved Master-Circular
  // chunk. Case-insensitive substring match on source_title.
  const titleNeedle = baseline.fallbackCitation.regulation_title.toLowerCase()
  const matchedChunk = retrievedChunks.find((c) =>
    c.source_title.toLowerCase().includes(titleNeedle)
  )

  // The baseline paragraph contains exactly 2 inline [Source: ...] markers,
  // so we surface 2 structured citations to keep markers and citations in sync.
  const citationBase = {
    regulation_title: baseline.fallbackCitation.regulation_title,
    section: baseline.fallbackCitation.section,
    snippet: baseline.fallbackCitation.snippet,
  }

  const citation: ValidatedCitation = matchedChunk
    ? { ...citationBase, chunk_id: matchedChunk.id, overlap: 1, status: 'pass' }
    : { ...citationBase, chunk_id: '', overlap: 0, status: 'flag' }

  return {
    text,
    validatedText: text,
    citations: [citation, citation],
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

// ── Span validation for a single paragraph (CLAUDE_PART2.md §1) ─────────────
//
// Post-payment rule: FAIL spans are SOFTENED, not deleted. Sentences are ONLY
// removed when their citation marker references a chunk_id that is NOT in the
// retrieved set (true hallucination). This is the explicit divergence from
// the pre-payment behavior — once a user has paid, we never punch holes in
// the letter for low-overlap snippets; we only excise outright fabrications.

export function validateParagraph(
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
      validatedText = removeClaimForCitation(validatedText, citation)
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

// ── Pure assembler (CLAUDE_PART2.md §1 — steps 4 + 5 + 6) ───────────────────
//
// Exported so the regression script (scripts/test-generation.ts) can exercise
// the validation + hard-minimums backfill logic with mocked retrievals and
// mocked LLM JSON, without hitting Supabase / Voyage / Anthropic.

export function assembleValidatedLetter(
  caseFacts: CaseFacts,
  chunks: KbSearchResult[],
  llmOutput: LetterOutput,
  options: { lowConfidence?: boolean } = {}
): GenerationResult {
  // STEPS 4 + 5: SPAN VALIDATION + THRESHOLD FILTERING
  const chunkMap = new Map(chunks.map((c) => [c.id, c]))
  const counters = { total: 0, failed: 0, flagged: 0 }

  const validatedParagraphs: ValidatedParagraph[] = llmOutput.body_paragraphs.map((para) =>
    validateParagraph(para, chunkMap, counters)
  )

  // STEP 6: POST-PAYMENT HARD MINIMUMS (CLAUDE_PART2.md §1)
  // ≥ 400 words, ≥ 3 valid citations. If short, append the category-specific
  // baseline paragraph (one or more times). Safety break after 5 extra
  // appends prevents any pathological loop even with an empty starting draft.
  const startCount = llmOutput.body_paragraphs.length
  while (
    countWords(validatedParagraphs) < POST_PAYMENT_MIN_WORDS ||
    countValidCitations(validatedParagraphs) < POST_PAYMENT_MIN_CITATIONS
  ) {
    const baseline = buildProceduralBaseline(caseFacts.rejectionReasonCategory, chunks)
    validatedParagraphs.push(baseline)
    counters.total += baseline.citations.length
    if (validatedParagraphs.length > startCount + 5) break
  }

  return {
    subjectLine: llmOutput.subject_line,
    salutation: llmOutput.salutation,
    paragraphs: validatedParagraphs,
    closing: llmOutput.closing,
    reliefSought: llmOutput.relief_sought,
    citationsTotal: counters.total,
    citationsFailed: counters.failed,
    citationsFlagged: counters.flagged,
    kbMissNote: options.lowConfidence
      ? 'This letter relies primarily on the procedural framework as direct category-specific regulations had limited match in our knowledge base.'
      : null,
    headerBlock: LETTER_HEADER_TEMPLATE(
      new Date().toISOString().slice(0, 10),
      caseFacts.insurer
    ),
    triClauseBlock: LETTER_TRI_CLAUSE(Math.round(caseFacts.claimAmount / 100)),
    escalationBlock: LETTER_ESCALATION_SENTENCE,
  }
}

// ── Main orchestrator ───────────────────────────────────────────────────────

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

  let letterOutput: LetterOutput
  try {
    letterOutput = LetterOutputSchema.parse(JSON.parse(cleanJson))
  } catch (parseError) {
    console.error('[generate] LetterOutputSchema parse failed:', parseError)
    throw new Error('LLM returned invalid letter structure')
  }

  // STEPS 4 + 5 + 6: delegate to pure assembler
  const categoryRaw = caseRow.rejection_reason_category ?? 'other'
  const category =
    categoryRaw in CATEGORY_BASELINES ? (categoryRaw as CanonicalCategory) : 'other'

  return assembleValidatedLetter(
    {
      insurer: caseRow.insurer ?? 'the insurer',
      claimAmount: caseRow.claim_amount ?? 0,
      rejectionReasonRaw: caseRow.rejection_reason_raw,
      rejectionReasonCategory: category,
      rejectionDate: caseRow.rejection_date,
    },
    retrievalResult.chunks,
    letterOutput,
    { lowConfidence }
  )
}
