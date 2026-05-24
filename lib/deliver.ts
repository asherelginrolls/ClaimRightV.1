import { generateDisputeLetter } from '@/lib/generation'
import { generatePdf } from '@/lib/pdf'
import { sendDisputeLetterEmail } from '@/lib/email'
import type { Database } from '@/lib/supabase'

type SupabaseClient = ReturnType<typeof import('@/lib/supabase').createServiceClient>
type CaseRow = Database['public']['Tables']['cases']['Row']

type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function typedUpdate(supabase: SupabaseClient, values: Database['public']['Tables']['cases']['Update']): UpdateQuery {
  return (supabase.from('cases').update as unknown as (v: typeof values) => UpdateQuery)(values)
}

/**
 * Generates, uploads, and delivers the dispute letter PDF for a case.
 * Must be called AFTER the case has been marked 'generating' to prevent
 * duplicate runs across concurrent download polls.
 */
export async function generateAndDeliver(
  caseId: string,
  supabase: SupabaseClient,
): Promise<void> {
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
