import Razorpay from 'razorpay'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import type { PaymentOrderResponse, ApiError } from '@/types/api'
import { rateLimit } from '@/lib/rate-limit'

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseUpdate = Database['public']['Tables']['cases']['Update']

// Type cast required: supabase-js generic resolution issue with custom Database types
// (same pattern as app/api/generate/route.ts)
type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function typedUpdate(
  supabase: ReturnType<typeof createServiceClient>,
  values: CaseUpdate,
): UpdateQuery {
  return (supabase.from('cases').update as unknown as (v: CaseUpdate) => UpdateQuery)(values)
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

export async function POST(
  request: NextRequest,
): Promise<NextResponse<PaymentOrderResponse | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { success } = rateLimit(`payment:${ip}`, { maxRequests: 5, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute before trying again.' },
      { status: 429 }
    )
  }

  let caseId: string | undefined
  try {
    const body = (await request.json()) as { caseId?: string }
    caseId = body.caseId
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!caseId) {
    return NextResponse.json({ error: 'caseId is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: rawCase, error: caseError } = await supabase
    .from('cases')
    .select('id, status')
    .eq('id', caseId)
    .single()

  if (caseError || !rawCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  const caseRow = rawCase as Pick<CaseRow, 'id' | 'status'>

  if (caseRow.status === 'paid' || caseRow.status === 'generated' || caseRow.status === 'delivered') {
    return NextResponse.json({ error: 'This case has already been paid' }, { status: 400 })
  }

  try {
    const order = await razorpay.orders.create({
      amount: 9900,
      currency: 'INR',
      receipt: caseId.slice(0, 40),
      notes: { caseId },
    })

    await typedUpdate(supabase, { razorpay_order_id: order.id }).eq('id', caseId)

    return NextResponse.json({
      orderId: order.id,
      amount: 9900,
      currency: 'INR',
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    })
  } catch (err) {
    console.error('[payment] Razorpay order creation failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Payment initialisation failed. Please try again.' }, { status: 500 })
  }
}
