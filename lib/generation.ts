import { z } from 'zod'
import { sonnet } from '@/lib/claude'
import { retrieveForCase } from '@/lib/retrieval'
import { GENERATION_SYSTEM_PROMPT, GENERATION_USER_PROMPT } from '@/prompts/generation'
import { createServiceClient, type Database } from '@/lib/supabase'
import type { KbSearchResult } from '@/types/kb'

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

// ── KB-miss fallback result ──────────────────────────────────────────────────

function buildKbMissResult(
  claimAmount: number | null,
  rejectionReasonRaw: string | null
): GenerationResult {
  const amountStr = claimAmount
    ? `₹${(claimAmount / 100).toLocaleString('en-IN')}`
    : '[amount]'

  return {
    subjectLine: 'Formal Grievance Regarding Rejection of Health Insurance Claim',
    salutation: 'Dear Grievance Redressal Officer,',
    paragraphs: [
      {
        text: `I am writing to formally dispute the rejection of my health insurance claim for ${amountStr}. The stated reason for rejection was: "${rejectionReasonRaw ?? 'as stated in your rejection letter'}". I request a detailed written review of this decision.\n\nNote: We were unable to find a specific IRDAI regulation directly applicable to your stated rejection reason in our current knowledge base. We recommend consulting an insurance advisor for additional regulatory arguments specific to your case. This letter establishes the formal grievance on record.`,
        validatedText: `I am writing to formally dispute the rejection of my health insurance claim for ${amountStr}. I request a detailed written review of this decision.\n\nNote: We were unable to find a specific IRDAI regulation directly applicable to your stated rejection reason. We recommend consulting an insurance advisor.`,
        citations: [],
        hasRemovedClaims: false,
      },
    ],
    closing:
      'I request resolution within 15 days as required under IRDAI guidelines. Failure to respond shall be treated as grounds for escalation to IGMS and the Insurance Ombudsman.',
    reliefSought: `Reinstatement and settlement of the rejected claim of ${amountStr} with applicable interest under IRDAI regulations.`,
    citationsTotal: 0,
    citationsFailed: 0,
    citationsFlagged: 0,
    kbMissNote:
      'No specific IRDAI regulation found for this rejection reason. Letter is a general grievance filing.',
  }
}

// ── Span validation for a single paragraph ──────────────────────────────────

function validateParagraph(
  para: { text: string; citations: Citation[] },
  chunkMap: Map<string, KbSearchResult>,
  counters: { total: number; failed: number; flagged: number }
): ValidatedParagraph {
  let validatedText = para.text
  const validatedCitations: ValidatedCitation[] = []

  for (const citation of para.citations) {
    counters.total++
    const chunk = chunkMap.get(citation.chunk_id)

    if (!chunk) {
      // Hallucinated chunk_id — not in the retrieved set
      counters.failed++
      const marker = `[Source: ${citation.regulation_title}`
      validatedText = removeSentenceContaining(validatedText, marker)
      validatedCitations.push({ ...citation, overlap: 0, status: 'fail' })
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
      counters.failed++
      const marker = `[Source: ${citation.regulation_title}`
      validatedText = removeSentenceContaining(validatedText, marker)
      validatedCitations.push({ ...citation, overlap, status: 'fail' })
    }
  }

  const hasRemovedClaims = validatedCitations.some((c) => c.status === 'fail')
  if (hasRemovedClaims) {
    validatedText +=
      '\n\n[Note: Some regulatory citations were removed from this paragraph as they could not be verified against our source documents. We recommend consulting an insurance advisor for additional arguments.]'
  }

  return {
    text: para.text,
    validatedText,
    citations: validatedCitations,
    hasRemovedClaims,
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
  const retrievalResult = await retrieveForCase({
    insurerName: caseRow.insurer,
    rejectionReasonRaw: caseRow.rejection_reason_raw,
    rejectionReasonCategory: caseRow.rejection_reason_category,
    claimAmount: caseRow.claim_amount,
  })

  // STEP 2: KB MISS GUARD (threshold: 0.65)
  if (retrievalResult.topScore < 0.65) {
    return buildKbMissResult(caseRow.claim_amount, caseRow.rejection_reason_raw)
  }

  // STEP 3: GENERATION (RAG)
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
          retrievalResult.chunks
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

  return {
    subjectLine: letterOutput.subject_line,
    salutation: letterOutput.salutation,
    paragraphs: validatedParagraphs,
    closing: letterOutput.closing,
    reliefSought: letterOutput.relief_sought,
    citationsTotal: counters.total,
    citationsFailed: counters.failed,
    citationsFlagged: counters.flagged,
    kbMissNote: null,
  }
}
