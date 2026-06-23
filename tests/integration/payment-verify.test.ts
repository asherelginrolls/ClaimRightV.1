import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'

vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true, remaining: 99 })) }))
vi.mock('@/lib/supabase', () => ({ createServiceClient: vi.fn() }))

const SECRET = 'rzp_test_secret_value'
process.env.RAZORPAY_KEY_SECRET = SECRET

import { POST } from '@/app/api/payment/verify/route'
import { createServiceClient } from '@/lib/supabase'
import { createMockSupabase, type MockConfig } from '../helpers/supabase-mock'
import { jsonRequest, badJsonRequest } from '../helpers/request'

const CASE_ID = '55555555-5555-4555-8555-555555555555'
const ORDER_ID = 'order_XYZ'
const PAYMENT_ID = 'pay_XYZ'

function sign(orderId: string, paymentId: string): string {
  return crypto.createHmac('sha256', SECRET).update(`${orderId}|${paymentId}`).digest('hex')
}

function mockSupabase(config: MockConfig) {
  const supa = createMockSupabase(config)
  vi.mocked(createServiceClient).mockReturnValue(supa as unknown as ReturnType<typeof createServiceClient>)
  return supa
}

describe('POST /api/payment/verify', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 on an unparseable body', async () => {
    const res = await POST(badJsonRequest())
    expect(res.status).toBe(400)
  })

  it('returns 400 when payment fields are missing', async () => {
    const res = await POST(jsonRequest({ razorpay_order_id: ORDER_ID }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing payment fields/i)
  })

  it('returns 400 on an invalid signature', async () => {
    const res = await POST(
      jsonRequest({
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: 'tampered-signature',
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/verification failed/i)
  })

  it('returns 404 when no case matches the order (valid signature)', async () => {
    mockSupabase({ tables: { cases: { single: { data: null, error: { message: 'no rows' } } } } })
    const res = await POST(
      jsonRequest({
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: sign(ORDER_ID, PAYMENT_ID),
      })
    )
    expect(res.status).toBe(404)
  })

  it('happy path: valid signature marks the case paid', async () => {
    const supa = mockSupabase({
      tables: { cases: { single: { data: { id: CASE_ID, status: 'analysed' }, error: null } } },
    })
    const res = await POST(
      jsonRequest({
        razorpay_order_id: ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: sign(ORDER_ID, PAYMENT_ID),
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, caseId: CASE_ID })

    const paidUpdate = supa.__updates.find((u) => u.values.status === 'paid')
    expect(paidUpdate).toBeDefined()
    expect(paidUpdate?.values.razorpay_payment_id).toBe(PAYMENT_ID)
    expect(paidUpdate?.values.paid_at).toBeTruthy()
  })
})
