'use client'

// Shared client-side pieces for the Case Vault: the StageWithArtifacts shape
// (mirrors app/api/cases/[caseId]/stages/route.ts), deadline + status chips,
// and the "how we built this" decision card.

import { daysUntil, type DisputeStage, type StageStatus } from '@/lib/deadlines'

export type ArtifactType =
  | 'grievance_letter'
  | 'complaint_form'
  | 'statement_of_case'
  | 'filing_walkthrough'
  | 'cc_list'
  | 'evidence_checklist'

export interface StageArtifactSummary {
  id: string
  type: ArtifactType
  generatedAt: string
}

/** Mirror of the response shape in app/api/cases/[caseId]/stages/route.ts */
export interface StageWithArtifacts {
  id: string
  stage: DisputeStage
  status: StageStatus
  deadlineDate: string | null
  deadlineLabel: string
  deadlineHard: boolean
  filedAt: string | null
  generationDecision: 'adapted' | 'rebuilt' | null
  generationReason: string | null
  generating: boolean
  artifacts: StageArtifactSummary[]
}

export interface StagesResponse {
  stages?: StageWithArtifacts[]
  error?: string
}

export const STATUS_LABELS: Record<StageStatus, string> = {
  not_started: 'Preparing',
  drafted: 'Ready to file',
  filed: 'Filed',
  awaiting_response: 'Awaiting response',
  resolved: 'Resolved',
  escalated: 'Escalated',
}

const STATUS_STYLES: Record<StageStatus, string> = {
  not_started: 'border-rule-strong bg-mist text-slate-muted',
  drafted: 'border-blue/30 bg-blue/10 text-blue-deep',
  filed: 'border-sky bg-sky-tint text-blue-deep',
  awaiting_response: 'border-sky bg-sky-tint text-blue-deep',
  resolved: 'border-hope/40 bg-hope/10 text-hope',
  escalated: 'border-rule-strong bg-mist text-slate-muted',
}

export const ARTIFACT_LABELS: Record<ArtifactType, string> = {
  grievance_letter: 'Grievance letter (PDF)',
  complaint_form: 'Complaint letter (PDF)',
  statement_of_case: 'Statement of case (PDF)',
  filing_walkthrough: 'Filing walkthrough',
  cc_list: 'Who to send copies to',
  evidence_checklist: 'Evidence checklist',
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function StatusChip({ status }: { status: StageStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

export function DeadlineChip({
  date,
  label,
}: {
  date: string | null
  label: string
}) {
  if (!date) return null
  const days = daysUntil(date)
  const tone =
    days < 5
      ? 'border-coral bg-coral/10 text-coral-deep'
      : days < 10
        ? 'border-sun bg-sun/15 text-gold-ink'
        : 'border-rule-strong bg-mist text-slate'
  const when = days < 0 ? `${Math.abs(days)} days past` : days === 0 ? 'today' : `in ${days} days`
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] tracking-wide ${tone}`}
    >
      {label} · {formatDate(date)} ({when})
    </span>
  )
}

export function DecisionCard({
  decision,
  reason,
}: {
  decision: 'adapted' | 'rebuilt'
  reason: string | null
}) {
  return (
    <div className="rounded-xl border border-rule bg-mist px-4 py-3">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
        How we built this letter
      </p>
      <p className="font-sans text-sm font-medium text-ink">
        {decision === 'adapted'
          ? 'Adapted from your earlier letter'
          : 'Built fresh for this stage'}
      </p>
      {reason && <p className="mt-1 font-sans text-sm leading-relaxed text-slate">{reason}</p>}
    </div>
  )
}
