import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({ createServiceClient: vi.fn() }))

const ADMIN_SECRET = 'admin-secret-value'
process.env.ADMIN_SECRET = ADMIN_SECRET

import { POST } from '@/app/api/admin/outcome/route'
import { createServiceClient } from '@/lib/supabase'
import { createMockSupabase, type MockConfig } from '../helpers/supabase-mock'
import { jsonRequest, badJsonRequest } from '../helpers/request'

const CASE_ID = '66666666-6666-4666-8666-666666666666'
const AUTH = { authorization: `Bearer ${ADMIN_SECRET}` }

function mockSupabase(config: MockConfig) {
  const supa = createMockSupabase(config)
  vi.mocked(createServiceClient).mockReturnValue(supa as unknown as ReturnType<typeof createServiceClient>)
  return supa
}

describe('POST /api/admin/outcome', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without a valid admin bearer token', async () => {
    const res = await POST(jsonRequest({ caseId: CASE_ID, outcome: 'won' }, { authorization: 'Bearer wrong' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 on an unparseable body', async () => {
    const res = await POST(badJsonRequest(AUTH))
    expect(res.status).toBe(400)
  })

  it('returns 400 on an invalid outcome value', async () => {
    const res = await POST(jsonRequest({ caseId: CASE_ID, outcome: 'maybe' }, AUTH))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('validation_error')
  })

  it('returns 404 when the case does not exist', async () => {
    mockSupabase({ tables: { cases: { single: { data: null, error: { message: 'no rows' } } } } })
    const res = await POST(jsonRequest({ caseId: CASE_ID, outcome: 'won', outcome_stage: 'ombudsman' }, AUTH))
    expect(res.status).toBe(404)
  })

  it('happy path: records the outcome label on the case', async () => {
    const supa = mockSupabase({ tables: { cases: { single: { data: { id: CASE_ID }, error: null } } } })
    const res = await POST(jsonRequest({ caseId: CASE_ID, outcome: 'won', outcome_stage: 'ombudsman' }, AUTH))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ caseId: CASE_ID, outcome: 'won', outcome_stage: 'ombudsman' })

    const upd = supa.__updates.find((u) => u.values.outcome === 'won')
    expect(upd).toBeDefined()
    expect(upd?.values.outcome_stage).toBe('ombudsman')
    expect(upd?.values.outcome_recorded_at).toBeTruthy()
  })
})
