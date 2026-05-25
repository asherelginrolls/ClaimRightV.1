import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import type { ApiError } from '@/types/api'
import { rateLimit } from '@/lib/rate-limit'

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseUpdate = Database['public']['Tables']['cases']['Update']
type SupabaseClient = ReturnType<typeof createServiceClient>

// Type cast required: supabase-js generic resolution issue with custom Database types
type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function typedUpdate(supabase: SupabaseClient, values: CaseUpdate): UpdateQuery {
  return (supabase.from('cases').update as unknown as (v: CaseUpdate) => UpdateQuery)(values)
}

interface VerifySuccessResponse {
  success: true
  caseId: string
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<VerifySuccessResponse | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { success } = await rateLimit(`payment-verify:${ip}`, { maxRequests: 5, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute before trying again.' },
      { status: 429 }
    )
  }

  let body: Record<string, string>
  try {
    body = (await request.json()) as Record<string, string>
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 })
  }

  // Verify HMAC-SHA256 signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex')

  const expectedBuf = Buffer.from(expectedSignature, 'hex')
  const receivedBuf = Buffer.from(razorpay_signature, 'hex')
  const sigValid =
    expectedBuf.length === receivedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, receivedBuf)
  if (!sigValid) {
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: rawCase, error: caseError } = await supabase
    .from('cases')
    .select('*')
    .eq('razorpay_order_id', razorpay_order_id)
    .single()

  if (caseError || !rawCase) {
    return NextResponse.json({ error: 'Case not found for this order' }, { status: 404 })
  }

  const caseRow = rawCase as CaseRow

  await typedUpdate(supabase, {
    status: 'paid',
    razorpay_payment_id,
    paid_at: new Date().toISOString(),
  }).eq('id', caseRow.id)

  // Generation happens lazily when the client polls /api/download/[caseId].
  // Fire-and-forget is avoided because Vercel kills serverless functions once
  // the response is sent, which caused generation to silently fail.
  return NextResponse.json({ success: true, caseId: caseRow.id })
}
