import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit } from '@/lib/rate-limit'

interface EmailResponse {
  email: string | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
): Promise<NextResponse<EmailResponse | { error: string }>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { success } = await rateLimit(`case-email:${ip}`, { maxRequests: 20, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { caseId } = params

  if (!caseId) {
    return NextResponse.json({ error: 'caseId is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('cases')
    .select('email')
    .eq('id', caseId)
    .single()

  if (error || !data) {
    return NextResponse.json({ email: null })
  }

  return NextResponse.json({ email: (data as { email: string | null }).email })
}
