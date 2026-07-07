// Stage artifact generation (Phase 4/5). generateStageArtifacts(caseId, stage)
// re-runs the FULL reasoning pipeline with a stage framing, renders the letter
// PDF plus the stage's deterministic companion artifacts (filing walkthrough,
// evidence checklist, cc list — no extra LLM calls), uploads everything to
// documents/{caseId}/stages/{stage}/, and records stage_artifacts rows.
//
// The adapt-vs-rebuild decision (lib/stage-policy.ts) is made here, logged on
// the stage row, and surfaced to the user. Either way the citation bar is
// identical: no ungrounded claim carries forward.

import { createServiceClient, type Database } from '@/lib/supabase'
import { runReasoning } from '@/lib/reasoning'
import { generateLetterFromAngles, flattenLetter, type CaseFacts } from '@/lib/generation'
import { generatePdf } from '@/lib/pdf'
import { getStageFraming } from '@/prompts/stage-framings'
import { decideGenerationStrategy } from '@/lib/stage-policy'
import { computeDeadline, STAGE_LABELS, STAGE_ORDER, type DisputeStage } from '@/lib/deadlines'
import { CATEGORY_BASELINES, type CanonicalCategory } from '@/prompts/category-baselines'

type CaseRow = Database['public']['Tables']['cases']['Row']
type CaseDocRow = Database['public']['Tables']['case_documents']['Row']
type StageRow = Database['public']['Tables']['dispute_stages']['Row']
type StageUpdate = Database['public']['Tables']['dispute_stages']['Update']
type ArtifactInsert = Database['public']['Tables']['stage_artifacts']['Insert']
type ArtifactType = ArtifactInsert['artifact_type']
type SupabaseClient = ReturnType<typeof createServiceClient>

type UpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
}
function updateStage(supabase: SupabaseClient, values: StageUpdate): UpdateQuery {
  return (supabase.from('dispute_stages').update as unknown as (v: StageUpdate) => UpdateQuery)(
    values
  )
}

// ── Deterministic companion artifacts ────────────────────────────────────────

export interface WalkthroughField {
  label: string
  value: string
}
export interface WalkthroughStep {
  step: number
  screen: string
  instruction: string
  fields?: WalkthroughField[]
}
export interface FilingWalkthrough {
  stage: DisputeStage
  generatedAt: string
  deadline: string | null
  deadlineLabel: string
  trustNote: string
  steps: WalkthroughStep[]
}

function buildBimaBharosaWalkthrough(
  caseRow: CaseRow,
  letterText: string,
  deadline: { date: string | null; label: string }
): FilingWalkthrough {
  const amount =
    caseRow.claim_amount != null
      ? `₹${Math.round(caseRow.claim_amount / 100).toLocaleString('en-IN')}`
      : ''
  return {
    stage: 'bima_bharosa',
    generatedAt: new Date().toISOString(),
    deadline: deadline.date,
    deadlineLabel: deadline.label,
    trustNote:
      'We prepare everything; you submit it yourself — that’s what the law requires (IRDAI does not allow third parties to file on Bima Bharosa), and it keeps you in control at every step.',
    steps: [
      {
        step: 1,
        screen: 'bimabharosa.irdai.gov.in — home page',
        instruction:
          'Open bimabharosa.irdai.gov.in in your browser and click "Register" (or "Login" if you already have an account). Registration asks for your name, mobile number, and email — use the same email you used with your insurer.',
      },
      {
        step: 2,
        screen: 'New complaint — policy details',
        instruction:
          'After logging in, choose "Register Complaint". The first screen asks about your policy. Enter these details exactly as they appear on your policy document:',
        fields: [
          { label: 'Insurance company', value: caseRow.insurer ?? 'As on your policy document' },
          { label: 'Type of policy', value: 'Health Insurance' },
          { label: 'Policy number', value: 'As printed on your policy schedule (we never store this)' },
          { label: 'Claim amount', value: amount || 'As per your claim documents' },
        ],
      },
      {
        step: 3,
        screen: 'New complaint — complaint type',
        instruction:
          'Select the complaint category that matches your rejection. For this case choose "Claim" → "Repudiation / rejection of claim" (or the closest available option).',
      },
      {
        step: 4,
        screen: 'New complaint — complaint description',
        instruction:
          'Paste the complaint text below into the description box. If the box has a character limit, paste the numbered paragraphs first — they carry the legal grounds.',
        fields: [{ label: 'Complaint text (copy this)', value: letterText }],
      },
      {
        step: 5,
        screen: 'New complaint — attachments',
        instruction:
          'Upload your rejection letter and the supporting documents you gave us (policy schedule, bills, discharge summary, and your earlier GRO grievance with any reply). PDFs work best.',
      },
      {
        step: 6,
        screen: 'Review and submit',
        instruction:
          'Review everything, then click Submit. Note down the complaint/token number the portal shows — you will need it to track the complaint and for the ombudsman stage if escalation becomes necessary. The insurer is required to respond within 15 days.',
      },
    ],
  }
}

export interface EvidenceChecklist {
  stage: DisputeStage
  generatedAt: string
  items: Array<{ item: string; have: boolean; note: string }>
}

function buildEvidenceChecklist(caseRow: CaseRow, docs: CaseDocRow[]): EvidenceChecklist {
  const have = new Set(docs.map((d) => d.doc_type))
  const items = [
    {
      item: 'Rejection / repudiation letter',
      have: have.has('rejection_letter'),
      note: 'The insurer’s written rejection — the core exhibit.',
    },
    {
      item: 'Policy schedule / policy document',
      have: have.has('policy_document'),
      note: 'Establishes coverage, policy age, and the exact wording of any exclusion cited.',
    },
    {
      item: 'Hospital bills and payment receipts',
      have: have.has('hospital_bills'),
      note: 'Proves the claimed amount.',
    },
    {
      item: 'Discharge summary',
      have: have.has('discharge_summary'),
      note: 'Establishes diagnosis and treatment — decisive when an exclusion is misapplied.',
    },
    {
      item: 'GRO grievance + insurer’s reply (or proof it went unanswered)',
      have: have.has('prior_correspondence'),
      note: 'Shows the grievance ladder was followed before approaching the ombudsman.',
    },
    {
      item: 'Bima Bharosa complaint acknowledgement / token number',
      have: false,
      note: 'From the portal after you filed — attach a screenshot or the acknowledgement email.',
    },
  ]
  return { stage: 'ombudsman', generatedAt: new Date().toISOString(), items }
}

export interface CcList {
  stage: DisputeStage
  generatedAt: string
  recipients: Array<{ who: string; why: string }>
}

function buildCcList(caseRow: CaseRow): CcList {
  return {
    stage: 'ombudsman',
    generatedAt: new Date().toISOString(),
    recipients: [
      {
        who: `The Grievance Redressal Officer, ${caseRow.insurer ?? 'your insurer'}`,
        why: 'The insurer must be on notice of the ombudsman complaint.',
      },
      {
        who: 'The Office of the Insurance Ombudsman (jurisdiction of your residence — find yours at cioins.co.in)',
        why: 'The complaint itself is filed here, by you personally.',
      },
    ],
  }
}

// ── Artifact upload helper ───────────────────────────────────────────────────

async function uploadArtifact(
  supabase: SupabaseClient,
  caseId: string,
  stageId: string,
  stage: DisputeStage,
  artifactType: ArtifactType,
  body: Buffer | string,
  contentType: string,
  ext: string
): Promise<void> {
  const storagePath = `${caseId}/stages/${stage}/${artifactType}.${ext}`
  const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, payload, { contentType, upsert: true })
  if (uploadError) throw new Error(`Artifact upload failed (${artifactType}): ${uploadError.message}`)

  const insert: ArtifactInsert = { stage_id: stageId, artifact_type: artifactType, storage_path: storagePath }
  const { error: rowError } = await (
    supabase.from('stage_artifacts').upsert as unknown as (
      v: ArtifactInsert,
      opts: { onConflict: string }
    ) => Promise<{ error: { message: string } | null }>
  )(insert, { onConflict: 'stage_id,artifact_type' })
  if (rowError) throw new Error(`stage_artifacts upsert failed (${artifactType}): ${rowError.message}`)
}

// ── Main orchestrator ────────────────────────────────────────────────────────

const LETTER_ARTIFACT_TYPE: Record<DisputeStage, ArtifactType> = {
  gro: 'grievance_letter',
  bima_bharosa: 'complaint_form',
  ombudsman: 'statement_of_case',
  consumer_court: 'grievance_letter', // never generated — guidance-only stage
}

export async function generateStageArtifacts(caseId: string, stage: DisputeStage): Promise<void> {
  if (stage === 'consumer_court') {
    throw new Error('Consumer court is a guidance-only stage — no artifacts are generated.')
  }

  const supabase = createServiceClient()

  const { data: rawCase, error: caseError } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .single()
  if (caseError || !rawCase) throw new Error('Case not found')
  const caseRow = rawCase as CaseRow
  if (!caseRow.paid_at) throw new Error('Stage artifacts require a paid case')
  if (!caseRow.rejection_reason_raw) throw new Error('No rejection reason on case')

  const { data: rawStage, error: stageError } = await supabase
    .from('dispute_stages')
    .select('*')
    .eq('case_id', caseId)
    .eq('stage', stage)
    .single()
  if (stageError || !rawStage) throw new Error('Stage not found — advance the case first')
  const stageRow = rawStage as StageRow

  const { data: rawDocs } = await supabase
    .from('case_documents')
    .select('*')
    .eq('case_id', caseId)
  const docs = (rawDocs ?? []) as CaseDocRow[]

  // Prior stage context: what stage came before, when it was filed, and any
  // documents (e.g. the insurer's reply) uploaded after that stage was created.
  const stageIdx = STAGE_ORDER.indexOf(stage)
  const priorStageName = stageIdx > 0 ? STAGE_ORDER[stageIdx - 1] : null
  let priorStage: StageRow | null = null
  if (priorStageName) {
    const { data: rawPrior } = await supabase
      .from('dispute_stages')
      .select('*')
      .eq('case_id', caseId)
      .eq('stage', priorStageName)
      .single()
    priorStage = (rawPrior as StageRow | null) ?? null
  }

  const newDocs = priorStage
    ? docs.filter((d) => new Date(d.uploaded_at) > new Date(priorStage!.created_at))
    : []

  const priorVerifiedAngleCount = (caseRow.fightability_reasons ?? []).filter(
    (r) => r.citation !== null
  ).length

  const strategy = decideGenerationStrategy({
    stage,
    newDocumentsSinceLastStage: newDocs.length > 0,
    priorVerifiedAngleCount,
  })

  // Build the prior-stage context block for the reasoning pipeline.
  const priorContextParts: string[] = []
  if (priorStage) {
    priorContextParts.push(
      `Previous stage: ${STAGE_LABELS[priorStage.stage]} — status "${priorStage.status}"${
        priorStage.filed_at ? `, filed ${priorStage.filed_at.slice(0, 10)}` : ''
      }.`
    )
  }
  for (const d of newDocs) {
    if (d.ocr_text) {
      priorContextParts.push(
        `New document since the previous stage (type: ${d.doc_type}) — extracted text:\n${d.ocr_text.slice(0, 2500)}`
      )
    } else {
      priorContextParts.push(`New document since the previous stage (type: ${d.doc_type}, text not yet extracted).`)
    }
  }
  if (strategy.decision === 'adapted') {
    priorContextParts.push(
      'Directive: the earlier stage’s verified arguments still hold — keep them as the core frame, re-aimed at the new authority.'
    )
  } else {
    priorContextParts.push(
      'Directive: rebuild the argument set from scratch for this stage; address every new point the insurer has raised.'
    )
  }

  // FULL pipeline re-run (REASON → GROUND → CLASSIFY); the letter step below
  // adds VALIDATE. Identical citation bar at every stage.
  const reasoning = await runReasoning({
    insurer: caseRow.insurer,
    claimAmountRupees: caseRow.claim_amount != null ? Math.round(caseRow.claim_amount / 100) : null,
    rejectionDate: caseRow.rejection_date,
    rejectionReasonRaw: caseRow.rejection_reason_raw,
    category: caseRow.rejection_reason_category ?? 'other',
    priorStageContext: priorContextParts.join('\n\n') || null,
  })

  const categoryRaw = caseRow.rejection_reason_category ?? 'other'
  const caseFacts: CaseFacts = {
    insurer: caseRow.insurer ?? 'the insurer',
    claimAmount: caseRow.claim_amount ?? 0,
    rejectionReasonRaw: caseRow.rejection_reason_raw,
    rejectionReasonCategory:
      categoryRaw in CATEGORY_BASELINES ? (categoryRaw as CanonicalCategory) : 'other',
    rejectionDate: caseRow.rejection_date,
  }

  const letter = await generateLetterFromAngles(caseFacts, reasoning, getStageFraming(stage))
  const pdfBuffer = await generatePdf(letter)

  await uploadArtifact(
    supabase, caseId, stageRow.id, stage,
    LETTER_ARTIFACT_TYPE[stage], pdfBuffer, 'application/pdf', 'pdf'
  )

  const deadline = computeDeadline(stage, 'drafted', {
    rejectionDate: caseRow.rejection_date,
    filedAt: null,
    priorStageFiledAt: priorStage?.filed_at ?? null,
  })

  if (stage === 'bima_bharosa') {
    const walkthrough = buildBimaBharosaWalkthrough(caseRow, flattenLetter(letter), deadline)
    await uploadArtifact(
      supabase, caseId, stageRow.id, stage,
      'filing_walkthrough', JSON.stringify(walkthrough, null, 2), 'application/json', 'json'
    )
  }

  if (stage === 'ombudsman') {
    await uploadArtifact(
      supabase, caseId, stageRow.id, stage,
      'evidence_checklist', JSON.stringify(buildEvidenceChecklist(caseRow, docs), null, 2),
      'application/json', 'json'
    )
    await uploadArtifact(
      supabase, caseId, stageRow.id, stage,
      'cc_list', JSON.stringify(buildCcList(caseRow), null, 2), 'application/json', 'json'
    )
  }

  const { error: stageUpdateError } = await updateStage(supabase, {
    status: 'drafted',
    deadline_date: deadline.date,
    generation_decision: strategy.decision,
    generation_reason: strategy.reason,
  }).eq('id', stageRow.id)
  if (stageUpdateError) throw new Error(`Stage update failed: ${stageUpdateError.message}`)
}
