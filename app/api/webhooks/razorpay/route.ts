import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import { generateDisputeLetter } from '@/lib/generation'
import { generatePdf } from '@/lib/pdf'
import { sendDisputeLetterEmail } from '@/lib/email'

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseUpdate = Database['public']['Tables']['cases']['Update']
type SupabaseClient = ReturnType<typeof createServiceClient>

type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function typedUpdate(supabase: SupabaseClient, values: CaseUpdate): UpdateQuery {
  return (supabase.from('cases').update as unknown as (v: CaseUpdate) => UpdateQuery)(values)
}

interface RazorpayWebhookPayload {
  event: string
  payload: {
    payment: {
      entity: {
        id: string
        order_id: string
        status: string
      }
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[webhook/razorpay] RAZORPAY_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = request.headers.get('x-razorpay-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const rawBody = await request.text()

  const expectedSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex')

  const sigBuf = Buffer.from(signature, 'hex')
  const expectedBuf = Buffer.from(expectedSig, 'hex')

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let payload: RazorpayWebhookPayload
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (payload.event !== 'payment.captured') {
    return NextResponse.json({ received: true })
  }

  const orderId = payload.payload.payment.entity.order_id
  const paymentId = payload.payload.payment.entity.id

  const supabase = createServiceClient()

  const { data: rawCase, error: caseError } = await supabase
    .from('cases')
    .select('*')
    .eq('razorpay_order_id', orderId)
    .single()

  if (caseError || !rawCase) {
    console.error('[webhook/razorpay] Case not found for order', orderId)
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  const caseRow = rawCase as CaseRow

  // Idempotency: skip if already processed
  if (
    caseRow.status === 'paid' ||
    caseRow.status === 'generated' ||
    caseRow.status === 'delivered'
  ) {
    return NextResponse.json({ received: true })
  }

  await typedUpdate(supabase, {
    status: 'paid',
    razorpay_payment_id: paymentId,
    paid_at: new Date().toISOString(),
  }).eq('id', caseRow.id)

  const DELIVERY_TIMEOUT_MS = 120_000
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('generateAndDeliver timed out after 120s')),
      DELIVERY_TIMEOUT_MS,
    ),
  )
  Promise.race([generateAndDeliver(caseRow.id, supabase), timeoutPromise]).catch((err: unknown) =>
    console.error(
      '[webhook/razorpay] Delivery error for',
      caseRow.id,
      ':',
      err instanceof Error ? err.message : String(err),
    ),
  )

  return NextResponse.json({ received: true })
}

async function generateAndDeliver(caseId: string, supabase: SupabaseClient): Promise<void> {
  const letterResult = await generateDisputeLetter(caseId)
  const pdfBuffer = await generatePdf(letterResult)

  const pdfPath = `${caseId}/dispute-letter.pdf`
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`)
  }

  await typedUpdate(supabase, { status: 'generated', letter_path: pdfPath }).eq('id', caseId)

  const { data: urlData } = await supabase.storage
    .from('documents')
    .createSignedUrl(pdfPath, 60 * 60 * 24)

  const { data: rawCaseRow } = await supabase
    .from('cases')
    .select('email')
    .eq('id', caseId)
    .single()

  const emailRow = rawCaseRow as Pick<CaseRow, 'email'> | null

  if (emailRow?.email && urlData?.signedUrl) {
    await sendDisputeLetterEmail(emailRow.email, caseId, urlData.signedUrl)
    await typedUpdate(supabase, { status: 'delivered' }).eq('id', caseId)
  }
}
