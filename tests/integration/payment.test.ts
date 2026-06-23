import { describe, it, expect, vi, beforeEach } from 'vitest'

// Razorpay is constructed at module load — provide a shared orders.create spy.
const { ordersCreate } = vi.hoisted(() => ({ ordersCreate: vi.fn() }))
vi.mock('razorpay', () => ({
  default: class {
    orders = { create: ordersCreate }
  },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true, remaining: 99 })) }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: vi.fn() }))

process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = 'rzp_test_public'
process.env.RAZORPAY_KEY_ID = 'rzp_test_id'
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret'

import { POST } from '@/app/api/payment/route'
import { createServiceClient } from '@/lib/supabase'
import { createMockSupabase, type MockConfig } from '../helpers/supabase-mock'
import { jsonRequest, badJsonRequest } from '../helpers/request'

const CASE_ID = '44444444-4444-4444-8444-444444444444'

function mockSupabase(config: MockConfig) {
  const supa = createMockSupabase(config)
  vi.mocked(createServiceClient).mockReturnValue(supa as unknown as ReturnType<typeof createServiceClient>)
  return supa
}

describe('POST /api/payment', () => {
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

  it('returns 400 when the case is already paid', async () => {
    mockSupabase({ tables: { cases: { single: { data: { id: CASE_ID, status: 'paid' }, error: null } } } })
    const res = await POST(jsonRequest({ caseId: CASE_ID }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/already been paid/i)
    expect(ordersCreate).not.toHaveBeenCalled()
  })

  it('happy path: creates a ₹299 order and returns the order shape', async () => {
    const supa = mockSupabase({
      tables: { cases: { single: { data: { id: CASE_ID, status: 'analysed' }, error: null } } },
    })
    ordersCreate.mockResolvedValue({ id: 'order_ABC123' })

    const res = await POST(jsonRequest({ caseId: CASE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      orderId: 'order_ABC123',
      amount: 29900,
      currency: 'INR',
      keyId: 'rzp_test_public',
    })
    // order id persisted on the case
    expect(supa.__updates.some((u) => u.values.razorpay_order_id === 'order_ABC123')).toBe(true)
  })

  it('returns a graceful 500 (no stack) when Razorpay throws', async () => {
    mockSupabase({ tables: { cases: { single: { data: { id: CASE_ID, status: 'analysed' }, error: null } } } })
    ordersCreate.mockRejectedValue(new Error('razorpay 502 gateway-secret'))
    const res = await POST(jsonRequest({ caseId: CASE_ID }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Payment initialisation failed. Please try again.' })
    expect(JSON.stringify(body)).not.toContain('gateway-secret')
  })
})
