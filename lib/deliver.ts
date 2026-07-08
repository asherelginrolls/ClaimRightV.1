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

  // Dispute engine: record the GRO stage + its letter artifact (idempotent).
  // Non-fatal — delivery of the paid letter never depends on the stage tables
  // existing (they arrive with migrations 010+).
  try {
    type StageInsert = Database['public']['Tables']['dispute_stages']['Insert']
    type ArtifactInsert = Database['public']['Tables']['stage_artifacts']['Insert']
    const stageInsert: StageInsert = { case_id: caseId, stage: 'gro', status: 'drafted' }
    await (
      supabase.from('dispute_stages').upsert as unknown as (
        v: StageInsert,
        o: { onConflict: string; ignoreDuplicates: boolean }
      ) => Promise<{ error: unknown }>
    )(stageInsert, { onConflict: 'case_id,stage', ignoreDuplicates: true })
    const { data: stageRow } = await supabase
      .from('dispute_stages')
      .select('id')
      .eq('case_id', caseId)
      .eq('stage', 'gro')
      .single()
    if (stageRow) {
      const artifactInsert: ArtifactInsert = {
        stage_id: (stageRow as { id: string }).id,
        artifact_type: 'grievance_letter',
        storage_path: pdfPath,
      }
      await (
        supabase.from('stage_artifacts').upsert as unknown as (
          v: ArtifactInsert,
          o: { onConflict: string }
        ) => Promise<{ error: unknown }>
      )(artifactInsert, { onConflict: 'stage_id,artifact_type' })
    }
  } catch (err) {
    console.warn('[deliver] GRO stage record skipped:', err instanceof Error ? err.message : String(err))
  }

  const { data: urlData } = await supabase.storage
    .from('documents')
    .createSignedUrl(pdfPath, 60 * 60 * 24)

  const { data: rawCaseRow } = await supabase
    .from('cases')
    .select('email')
    .eq('id', caseId)
    .single()

  const emailRow = rawCaseRow as Pick<CaseRow, 'email'> | null

  // Email is strictly non-fatal: the letter is already uploaded and the case is
  // 'generated'. A hung or failing email provider must never throw — that used
  // to bubble up to the download route, reset the case to 'paid', and re-run
  // the entire (paid) letter pipeline on the next poll.
  if (emailRow?.email && urlData?.signedUrl) {
    try {
      await Promise.race([
        sendDisputeLetterEmail(emailRow.email, caseId, urlData.signedUrl),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('email send timed out after 10s')), 10_000)
        ),
      ])
      await typedUpdate(supabase, { status: 'delivered' }).eq('id', caseId)
    } catch (err) {
      console.warn(
        '[deliver] email send failed (non-fatal, letter already generated):',
        err instanceof Error ? err.message : String(err)
      )
    }
  }
}
