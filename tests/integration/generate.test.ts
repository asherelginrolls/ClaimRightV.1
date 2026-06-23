import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true, remaining: 99 })) }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/generation', () => ({ generateDisputeLetter: vi.fn() }))

import { POST } from '@/app/api/generate/route'
import { createServiceClient } from '@/lib/supabase'
import { generateDisputeLetter } from '@/lib/generation'
import { createMockSupabase, type MockConfig } from '../helpers/supabase-mock'
import { jsonRequest, badJsonRequest } from '../helpers/request'

const CASE_ID = '33333333-3333-4333-8333-333333333333'

function mockSupabase(config: MockConfig) {
  vi.mocked(createServiceClient).mockReturnValue(
    createMockSupabase(config) as unknown as ReturnType<typeof createServiceClient>
  )
}

describe('POST /api/generate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 on an unparseable body', async () => {
    const res = await POST(badJsonRequest())
    expect(res.status).toBe(400)
  })

  it('returns 400 when caseId is missing', async () => {
    const res = await POST(jsonRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the case is not found', async () => {
    mockSupabase({ tables: { cases: { single: { data: null, error: { message: 'no rows' } } } } })
    const res = await POST(jsonRequest({ caseId: CASE_ID }))
    expect(res.status).toBe(404)
  })

  it('enforces the post-payment gate: refuses with 403 when status is not "paid"', async () => {
    mockSupabase({ tables: { cases: { single: { data: { id: CASE_ID, status: 'analysed' }, error: null } } } })
    const res = await POST(jsonRequest({ caseId: CASE_ID }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/payment required/i)
    expect(generateDisputeLetter).not.toHaveBeenCalled()
  })

  it('happy path: paid case generates a letter and returns the success shape', async () => {
    const supa = createMockSupabase({
      tables: { cases: { single: { data: { id: CASE_ID, status: 'paid' }, error: null } } },
    })
    vi.mocked(createServiceClient).mockReturnValue(supa as unknown as ReturnType<typeof createServiceClient>)
    vi.mocked(generateDisputeLetter).mockResolvedValue({
      citationsFailed: 1,
      citationsFlagged: 2,
      kbMissNote: null,
    } as unknown as Awaited<ReturnType<typeof generateDisputeLetter>>)

    const res = await POST(jsonRequest({ caseId: CASE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      caseId: CASE_ID,
      message: expect.any(String),
      citationsFailed: 1,
      citationsFlagged: 2,
      kbMissNote: null,
    })
    // status advanced to 'generated'
    expect(supa.__updates.some((u) => u.values.status === 'generated')).toBe(true)
  })

  it('returns a graceful 500 (no stack) when generation throws', async () => {
    mockSupabase({ tables: { cases: { single: { data: { id: CASE_ID, status: 'paid' }, error: null } } } })
    vi.mocked(generateDisputeLetter).mockRejectedValue(new Error('sonnet boom internal-trace'))
    const res = await POST(jsonRequest({ caseId: CASE_ID }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Generation failed. Please try again.' })
    expect(JSON.stringify(body)).not.toContain('internal-trace')
  })
})
