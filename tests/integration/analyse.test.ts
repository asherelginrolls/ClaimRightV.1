import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { z } from 'zod'

// ── Mocks (all external services) ───────────────────────────────────────────
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ success: true, remaining: 99 })),
  rateLimitUpload: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/supabase', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/ocr-docs', () => ({
  ensureOcrForDocs: vi.fn(async () => {}),
  downloadAndOcr: vi.fn(async () => ''),
}))
vi.mock('@/lib/retrieval', () => ({
  retrieveForCase: vi.fn(),
  retrieveChunks: vi.fn(),
  GATING_FLOOR: 0.65,
  RETRIEVAL_THRESHOLD: 0.55,
}))
vi.mock('@/lib/claude', () => ({
  haiku: { messages: { create: vi.fn() } },
  sonnet: { messages: { create: vi.fn() } },
}))

import { GET } from '@/app/api/analyse/route'
import { createServiceClient } from '@/lib/supabase'
import { retrieveForCase } from '@/lib/retrieval'
import { haiku } from '@/lib/claude'
import { createMockSupabase, type MockConfig } from '../helpers/supabase-mock'
import { getRequest } from '../helpers/request'
import { makeChunk } from '../helpers/kb'

const AnalyseResponseSchema = z.object({
  caseId: z.string(),
  insurer: z.string().nullable(),
  claimAmount: z.number().nullable(),
  rejectionReasonCategory: z.string().nullable(),
  fightabilityScore: z.enum(['low', 'medium', 'strong']),
  fightabilityReasons: z.array(z.object({ reason: z.string(), citation: z.string().nullable() })),
  fightabilityNumeric: z.number(),
  evidenceSummaries: z.array(
    z.object({
      source_title: z.string(),
      section_number: z.string().nullable(),
      tier: z.number(),
      similarity: z.number(),
      explainer: z.string(),
    })
  ),
  regulationMatchCount: z.number(),
  precedentMatchCount: z.number(),
  pointByPointAnalysis: z.array(z.string()),
})

const CASE_ID = '11111111-1111-4111-8111-111111111111'

const VALID_FACTS = {
  insurer: 'Star Health',
  claim_amount: 75000,
  rejection_date: '2026-05-01',
  rejection_reason_raw: 'Your claim has been rejected for incomplete documentation.',
  rejection_reason_category: 'documentation_incomplete',
  documents_requested_count: 2,
  policy_age_months: null,
  policy_type: 'individual',
  rejection_reason_confidence: 0.95,
}

function mockSupabase(config: MockConfig) {
  vi.mocked(createServiceClient).mockReturnValue(
    createMockSupabase(config) as unknown as ReturnType<typeof createServiceClient>
  )
}

function textMsg(obj: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] }
}

function uploadedCaseRow() {
  return {
    id: CASE_ID,
    status: 'uploaded',
    document_path: null,
    insurer: null,
    claim_amount: null,
    rejection_reason_raw: null,
    rejection_reason_category: null,
    rejection_date: null,
  }
}

function rejectionDocRows() {
  return [
    {
      id: '22222222-2222-4222-8222-222222222222',
      case_id: CASE_ID,
      doc_type: 'rejection_letter',
      storage_path: `${CASE_ID}/rejection_letter-abcd.pdf`,
      ocr_text:
        'This is the official claim rejection letter from Star Health Insurance denying the ' +
        'reimbursement claim on the ground of incomplete documentation, with two separate requests.',
      extracted_facts: null,
      uploaded_at: '2026-05-02T00:00:00Z',
    },
  ]
}

describe('GET /api/analyse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when caseId is missing', async () => {
    const res = await GET(getRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 404 when the case does not exist', async () => {
    mockSupabase({ tables: { cases: { single: { data: null, error: { message: 'no rows' } } } } })
    const res = await GET(getRequest({ caseId: CASE_ID }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
  })

  it('happy path returns a well-shaped AnalyseResponse', async () => {
    mockSupabase({
      tables: {
        cases: { single: { data: uploadedCaseRow(), error: null } },
        case_documents: { rows: rejectionDocRows() },
      },
    })
    const chunk = makeChunk({ tier: 1, similarity: 0.82 })
    vi.mocked(retrieveForCase).mockResolvedValue({ chunks: [chunk], queryEmbedding: [], topScore: 0.82 })

    const create = haiku.messages.create as unknown as Mock
    create
      .mockResolvedValueOnce(textMsg(VALID_FACTS)) // extraction
      .mockResolvedValueOnce(
        textMsg({
          explainers: ['Prohibits piecemeal document requests.'],
          pointByPoint: ['A', 'B', 'C', 'D', 'E', 'F'],
        })
      ) // explainers + point-by-point

    const res = await GET(getRequest({ caseId: CASE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const parsed = AnalyseResponseSchema.parse(body)
    expect(parsed.caseId).toBe(CASE_ID)
    expect(parsed.fightabilityScore).toBe('strong') // documentation_incomplete + 2 doc requests
    expect(parsed.insurer).toBe('Star Health')
    expect(parsed.pointByPointAnalysis.length).toBeGreaterThanOrEqual(3)
  })

  it('degrades gracefully (200 fallback, no stack) when the Claude extraction call throws', async () => {
    mockSupabase({
      tables: {
        cases: { single: { data: uploadedCaseRow(), error: null } },
        case_documents: { rows: rejectionDocRows() },
      },
    })
    const create = haiku.messages.create as unknown as Mock
    create.mockRejectedValueOnce(new Error('anthropic 529 overloaded'))

    const res = await GET(getRequest({ caseId: CASE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fightabilityScore).toBe('medium')
    expect(JSON.stringify(body)).not.toContain('529 overloaded') // no raw upstream error leaked
  })

  it('returns a graceful 500 (no stack trace, no PII) when retrieval throws', async () => {
    mockSupabase({
      tables: {
        cases: { single: { data: uploadedCaseRow(), error: null } },
        case_documents: { rows: rejectionDocRows() },
      },
    })
    const create = haiku.messages.create as unknown as Mock
    create.mockResolvedValueOnce(textMsg(VALID_FACTS))
    vi.mocked(retrieveForCase).mockRejectedValue(new Error('voyage exploded with secret token sk-123'))

    const res = await GET(getRequest({ caseId: CASE_ID }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Analysis failed. Please try again.' })
    expect(JSON.stringify(body)).not.toContain('sk-123')
    expect(body).not.toHaveProperty('stack')
  })
})
