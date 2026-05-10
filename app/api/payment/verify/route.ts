import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import { generateDisputeLetter } from '@/lib/generation'
import { generatePdf } from '@/lib/pdf'
import { sendDisputeLetterEmail } from '@/lib/email'
import type { ApiError } from '@/types/api'
import { rateLimit } from '@/lib/rate-limit'

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseUpdate = Database['public']['Tables']['cases']['Update']
type SupabaseClient = ReturnType<typeof createServiceClient>

// Type cast required: supabase-js generic resolution issue with custom Database types
// (same pattern as app/api/generate/route.ts)
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
  const { success } = rateLimit(`payment-verify:${ip}`, { maxRequests: 5, windowMs: 60_000 })
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

  if (expectedSignature !== razorpay_signature) {
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

  // Fire-and-forget: generate + deliver in background (client polls /api/download/[caseId])
  // 120s timeout: generous for Sonnet generation; prevents case staying 'paid' forever if hung
  const DELIVERY_TIMEOUT_MS = 120_000
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('generateAndDeliver timed out after 120s')),
      DELIVERY_TIMEOUT_MS,
    ),
  )
  Promise.race([generateAndDeliver(caseRow.id, supabase), timeoutPromise]).catch((err: unknown) =>
    console.error(
      '[payment/verify] Delivery error for',
      caseRow.id,
      ':',
      err instanceof Error ? err.message : String(err),
    ),
  )

  return NextResponse.json({ success: true, caseId: caseRow.id })
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
