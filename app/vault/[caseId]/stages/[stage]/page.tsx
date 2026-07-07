// Stage workspace — server auth-gate, then the client StageWorkspace.

import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { createServiceClient, type Database } from '@/lib/supabase'
import { STAGE_ORDER, type DisputeStage } from '@/lib/deadlines'
import { StageWorkspace } from '@/app/components/StageWorkspace'

export const dynamic = 'force-dynamic'

type CaseRow = Database['public']['Tables']['cases']['Row']

export default async function StagePage({
  params,
}: {
  params: { caseId: string; stage: string }
}) {
  const user = await getAuthenticatedUser()
  if (!user) redirect(`/auth?next=/vault/${params.caseId}`)

  if (!STAGE_ORDER.includes(params.stage as DisputeStage)) {
    redirect(`/vault/${params.caseId}`)
  }
  const stage = params.stage as DisputeStage

  const supabase = createServiceClient()
  const { data: rawCase } = await supabase
    .from('cases')
    .select('*')
    .eq('id', params.caseId)
    .single()
  if (!rawCase) redirect('/vault')
  const caseRow = rawCase as CaseRow
  if (caseRow.user_id !== user.id) redirect('/vault')

  return <StageWorkspace caseId={params.caseId} stage={stage} />
}
