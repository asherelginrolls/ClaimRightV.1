// Bind an anonymous case to the signed-in user's account.
// Claim rule: user_id IS NULL AND (session cookie matches the case OR the
// case email matches the signed-in email). Idempotent for the same user.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import { getAuthenticatedUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import type { ApiError } from '@/types/api'

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseUpdate = Database['public']['Tables']['cases']['Update']
type SupabaseClient = ReturnType<typeof createServiceClient>

type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function typedUpdate(supabase: SupabaseClient, values: CaseUpdate): UpdateQuery {
  return (supabase.from('cases').update as unknown as (v: CaseUpdate) => UpdateQuery)(values)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
): Promise<NextResponse<{ claimed: true } | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { success } = await rateLimit(`claim:${ip}`, { maxRequests: 10, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to claim this case.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: rawCase, error } = await supabase
    .from('cases')
    .select('*')
    .eq('id', params.caseId)
    .single()

  if (error || !rawCase) {
    return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
  }
  const caseRow = rawCase as CaseRow

  if (caseRow.user_id === user.id) {
    return NextResponse.json({ claimed: true }) // already theirs — idempotent
  }
  if (caseRow.user_id !== null) {
    return NextResponse.json({ error: 'This case belongs to another account.' }, { status: 403 })
  }

  const sessionMatch = request.cookies.get('cr_sid')?.value === params.caseId
  const emailMatch =
    caseRow.email != null &&
    user.email != null &&
    caseRow.email.toLowerCase() === user.email.toLowerCase()

  if (!sessionMatch && !emailMatch) {
    return NextResponse.json(
      { error: 'We couldn’t link this case to your account. Use the same email you entered at upload.' },
      { status: 403 }
    )
  }

  const { error: updateError } = await typedUpdate(supabase, { user_id: user.id }).eq(
    'id',
    params.caseId
  )
  if (updateError) {
    return NextResponse.json({ error: 'Could not claim the case. Try again.' }, { status: 500 })
  }

  return NextResponse.json({ claimed: true })
}
