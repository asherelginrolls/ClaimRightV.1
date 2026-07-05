// REASON → GROUND → VALIDATE pipeline (CLAUDE.md §7) — steps 1–4.
//
// Order matters: reason first (Sonnet strategize + adversarial check), THEN
// ground each surviving angle against the KB, then classify each angle as
// VERIFIED (grounded ≥ GATING_FLOOR → cite) or GENERAL PRINCIPLE (honestly
// labeled, never a fabricated citation). Step 5 (span validation) lives in
// lib/generation.ts.
//
// This module is DB-case-row-free by design: it takes plain facts so the
// analyse route, the letter generator, the stage engine (adapt/rebuild), and
// the eval harness can all share it.

import { z } from 'zod'
import { sonnet } from '@/lib/claude'
import {
  retrieveWithEmbedding,
  retrieveForCase,
  expandQueryWithSynonyms,
  type RetrievalResult,
} from '@/lib/retrieval'
import { embedBatch } from '@/lib/voyage'
import { GATING_FLOOR } from '@/lib/thresholds'
import { STRATEGIZE_SYSTEM_PROMPT, STRATEGIZE_USER_PROMPT } from '@/prompts/reasoning'
import { getPlaybook } from '@/prompts/playbooks'
import type { KbSearchResult } from '@/types/kb'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReasoningInput {
  insurer: string | null
  claimAmountRupees: number | null
  rejectionDate: string | null
  rejectionReasonRaw: string | null
  category: string
  documentsRequestedCount?: number | null
  policyAgeMonths?: number | null
  primaryDiagnosis?: string | null
  /** Free-text extra context: supporting-doc facts, narrative, etc. */
  extraContext?: string | null
  /** Stage engine: what happened at the previous stage incl. insurer's reply. */
  priorStageContext?: string | null
}

const StrategizeOutputSchema = z.object({
  angles: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        argument: z.string().min(20),
        search_query: z.string().min(8),
        adversarial_note: z.string(),
      })
    )
    .min(1)
    .max(6),
  dropped: z.array(z.object({ title: z.string(), reason: z.string() })).default([]),
})

export interface StrategizedAngle {
  id: string
  title: string
  argument: string
  searchQuery: string
  adversarialNote: string
}

export interface GroundedAngle extends StrategizedAngle {
  classification: 'verified' | 'general_principle'
  chunks: KbSearchResult[]
  topScore: number
}

export interface ReasoningResult {
  angles: GroundedAngle[]
  dropped: Array<{ title: string; reason: string }>
  /** Deduped union of all angle chunks (plus base retrieval), for scoring + letter. */
  merged: RetrievalResult
  /** True when strategize failed and we fell back to single-query retrieval. */
  usedFallback: boolean
}

/** Pluggable retriever: one RetrievalResult per query, same order. The default
 *  batches all queries into one Voyage embed call. The eval harness injects a
 *  lexical mock so the pipeline can run without Supabase. */
export type AngleRetriever = (queries: string[]) => Promise<RetrievalResult[]>

// ── Facts block rendering ────────────────────────────────────────────────────

export function renderFactsBlock(input: ReasoningInput): string {
  const lines = [
    `Insurer: ${input.insurer ?? 'unknown'}`,
    `Claim amount: ${input.claimAmountRupees != null ? `₹${input.claimAmountRupees.toLocaleString('en-IN')}` : 'unknown'}`,
    `Rejection date: ${input.rejectionDate ?? 'unknown'}`,
    `Rejection reason (verbatim from letter): ${input.rejectionReasonRaw ?? 'unknown'}`,
    `Rejection category: ${input.category.replace(/_/g, ' ')}`,
    input.policyAgeMonths != null ? `Policy age: ${input.policyAgeMonths} months of continuous coverage` : null,
    input.documentsRequestedCount != null
      ? `Separate document requests received from insurer: ${input.documentsRequestedCount}`
      : null,
    input.primaryDiagnosis ? `Primary diagnosis: ${input.primaryDiagnosis}` : null,
    input.extraContext ? `Additional context: ${input.extraContext}` : null,
  ]
  return lines.filter((l): l is string => l !== null).join('\n')
}

// ── Step 1–2: STRATEGIZE + ADVERSARIAL CHECK (one Sonnet call, temp 0) ──────

export async function strategizeAngles(
  input: ReasoningInput
): Promise<{ angles: StrategizedAngle[]; dropped: Array<{ title: string; reason: string }> }> {
  const playbook = getPlaybook(input.category)
  // Sonnet reasoning needs more than the 30s default the Haiku calls use;
  // 60s hard cap keeps the analyse fast path within budget (maxDuration 300).
  // Retries once with a conciseness nudge if the JSON is truncated/invalid.
  let parsed: z.infer<typeof StrategizeOutputSchema> | null = null
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const msg = await sonnet.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 2800,
        temperature: 0,
        system:
          attempt === 0
            ? STRATEGIZE_SYSTEM_PROMPT
            : STRATEGIZE_SYSTEM_PROMPT +
              '\n\nIMPORTANT: your previous response was truncated or invalid JSON. Output at most 4 angles, keep each argument under 60 words and each dropped reason under 20 words.',
        messages: [
          {
            role: 'user',
            content: STRATEGIZE_USER_PROMPT({
              factsBlock: renderFactsBlock(input),
              playbook,
              priorStageContext: input.priorStageContext,
            }),
          },
        ],
      },
      { timeout: 60_000 }
    )

    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}'
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim()
    try {
      parsed = StrategizeOutputSchema.parse(JSON.parse(cleaned))
    } catch (err) {
      const truncated = msg.stop_reason === 'max_tokens'
      console.warn(
        `[reasoning] strategize parse failed (attempt ${attempt + 1}${truncated ? ', truncated' : ''})`
      )
      if (attempt === 1) throw err
    }
  }
  if (!parsed) throw new Error('strategize returned invalid JSON')

  return {
    angles: parsed.angles.slice(0, 5).map((a) => ({
      id: a.id,
      title: a.title,
      argument: a.argument,
      searchQuery: a.search_query,
      adversarialNote: a.adversarial_note,
    })),
    dropped: parsed.dropped,
  }
}

// ── Step 3: GROUND (batch embed → per-angle RPC → Tier-1 rerank) ────────────

const defaultRetriever: AngleRetriever = async (queries) => {
  const expanded = queries.map((q) => expandQueryWithSynonyms(q))
  const embeddings = await embedBatch(expanded, 'query')
  return Promise.all(
    queries.map((q, i) => retrieveWithEmbedding(embeddings[i], q, { matchCount: 8 }))
  )
}

function mergeRetrievals(results: RetrievalResult[]): RetrievalResult {
  const byId = new Map<string, KbSearchResult>()
  for (const r of results) {
    for (const c of r.chunks) {
      const existing = byId.get(c.id)
      if (!existing || c.similarity > existing.similarity) byId.set(c.id, c)
    }
  }
  const chunks = Array.from(byId.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 6)
  return {
    chunks,
    queryEmbedding: results[0]?.queryEmbedding ?? [],
    topScore: chunks[0]?.similarity ?? 0,
  }
}

// ── Step 4: CLASSIFY ─────────────────────────────────────────────────────────

function classify(angle: StrategizedAngle, retrieval: RetrievalResult): GroundedAngle {
  const topScore = retrieval.topScore
  return {
    ...angle,
    chunks: retrieval.chunks.slice(0, 3),
    topScore,
    classification: topScore >= GATING_FLOOR ? 'verified' : 'general_principle',
  }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export async function runReasoning(
  input: ReasoningInput,
  opts: { retriever?: AngleRetriever } = {}
): Promise<ReasoningResult> {
  const retriever = opts.retriever ?? defaultRetriever

  let strategized: Awaited<ReturnType<typeof strategizeAngles>>
  try {
    strategized = await strategizeAngles(input)
  } catch (err) {
    console.warn(
      '[reasoning] strategize failed — falling back to single-query retrieval:',
      err instanceof Error ? err.message : String(err)
    )
    // Resilience fallback: behave like the pre-Phase-3 pipeline (single
    // retrieval, no angles). Callers must handle angles.length === 0.
    const merged = await retrieveForCase({
      insurerName: input.insurer,
      rejectionReasonRaw: input.rejectionReasonRaw,
      rejectionReasonCategory: input.category,
      claimAmount: input.claimAmountRupees,
      policyAgeMonths: input.policyAgeMonths ?? null,
      primaryDiagnosis: input.primaryDiagnosis ?? null,
    })
    return { angles: [], dropped: [], merged, usedFallback: true }
  }

  let groundings: RetrievalResult[]
  try {
    groundings = await retriever(strategized.angles.map((a) => a.searchQuery))
  } catch (err) {
    console.warn(
      '[reasoning] grounding failed — classifying all angles as general principles:',
      err instanceof Error ? err.message : String(err)
    )
    const empty: RetrievalResult = { chunks: [], queryEmbedding: [], topScore: 0 }
    groundings = strategized.angles.map(() => empty)
  }

  const angles = strategized.angles.map((a, i) => classify(a, groundings[i]))
  const merged = mergeRetrievals(groundings)

  return { angles, dropped: strategized.dropped, merged, usedFallback: false }
}

// ── Eval entry point (scripts/eval/run-golden.ts pipeline mode) ─────────────

export interface EvalPipelineInput {
  facts: {
    insurer: string | null
    claim_amount: number | null // paise (golden cases store paise)
    rejection_date: string | null
    rejection_reason_raw: string | null
    rejection_reason_category: string
    documents_requested_count: number | null
    policy_age_months: number | null
    policy_type: string
    rejection_reason_confidence: number
  }
  extraContext: string
  primaryDiagnosis: string | null
}

export async function runReasoningPipelineForEval(
  input: EvalPipelineInput,
  opts: { retriever?: AngleRetriever } = {}
): Promise<{
  letterText: string
  retrievedSourceTitles: string[]
  angles: GroundedAngle[]
  usedFallback: boolean
}> {
  // Local import avoids a cycle: generation.ts imports reasoning.ts.
  const { generateLetterFromAngles, flattenLetter } = await import('@/lib/generation')

  const reasoning = await runReasoning(
    {
      insurer: input.facts.insurer,
      claimAmountRupees:
        input.facts.claim_amount != null ? Math.round(input.facts.claim_amount / 100) : null,
      rejectionDate: input.facts.rejection_date,
      rejectionReasonRaw: input.facts.rejection_reason_raw,
      category: input.facts.rejection_reason_category,
      documentsRequestedCount: input.facts.documents_requested_count,
      policyAgeMonths: input.facts.policy_age_months,
      primaryDiagnosis: input.primaryDiagnosis,
      extraContext: input.extraContext,
    },
    opts
  )

  const result = await generateLetterFromAngles(
    {
      insurer: input.facts.insurer ?? 'the insurer',
      claimAmount: input.facts.claim_amount ?? 0,
      rejectionReasonRaw: input.facts.rejection_reason_raw ?? '',
      rejectionReasonCategory:
        (input.facts.rejection_reason_category as import('@/prompts/category-baselines').CanonicalCategory) ??
        'other',
      rejectionDate: input.facts.rejection_date,
    },
    reasoning
  )

  const allChunks = new Set<string>()
  for (const a of reasoning.angles) for (const c of a.chunks) allChunks.add(c.source_title)
  for (const c of reasoning.merged.chunks) allChunks.add(c.source_title)

  return {
    letterText: flattenLetter(result),
    retrievedSourceTitles: Array.from(allChunks),
    angles: reasoning.angles,
    usedFallback: reasoning.usedFallback,
  }
}
