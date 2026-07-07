'use client'

// The escalation ladder for a case: GRO → Bima Bharosa → Ombudsman → Consumer
// Court. Polls the stages endpoint while artifacts are generating, lets the
// user download artifacts, and advances the case to the next stage.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { STAGE_ORDER, STAGE_LABELS, nextStage, type DisputeStage } from '@/lib/deadlines'
import {
  ARTIFACT_LABELS,
  DeadlineChip,
  DecisionCard,
  StatusChip,
  type StagesResponse,
  type StageWithArtifacts,
} from '@/app/components/stage-shared'

const NEXT_STAGE_EXPLAINERS: Record<DisputeStage, string> = {
  gro: "A formal grievance to your insurer's Grievance Redressal Officer — the required first step.",
  bima_bharosa:
    "Bima Bharosa is IRDAI's official complaint portal. We prepare the complaint text and walk you through the portal screen by screen — you paste and submit, and the insurer must respond within 15 days.",
  ombudsman:
    'The Insurance Ombudsman is free, no lawyers are allowed, and it resolved 94.5% of complaints last year. We prepare your statement of case, an evidence checklist, and the list of who to copy.',
  consumer_court:
    'Consumer court is the last resort. There is nothing to generate here — we give you clear guidance, and you carry your full Ashray dossier with you.',
}

interface CaseTimelineProps {
  caseId: string
  paid: boolean
  rejectionDate: string | null
}

export function CaseTimeline({ caseId, paid, rejectionDate }: CaseTimelineProps) {
  const [stages, setStages] = useState<StageWithArtifacts[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [advanceFile, setAdvanceFile] = useState<File | null>(null)
  const [advanceBusy, setAdvanceBusy] = useState(false)
  const [advanceError, setAdvanceError] = useState<string | null>(null)

  const fetchStages = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}/stages`)
      const data = (await res.json()) as StagesResponse
      if (!res.ok || !data.stages) {
        setError(data.error ?? "We couldn't load your case timeline. Please refresh the page.")
        return
      }
      setStages(data.stages)
      setError(null)
    } catch {
      setError("We couldn't load your case timeline. Please refresh the page.")
    }
  }, [caseId])

  useEffect(() => {
    void fetchStages()
  }, [fetchStages])

  // Poll every 4s while any stage is still generating (or queued to generate).
  useEffect(() => {
    if (!paid || !stages) return
    const pending = stages.some(
      (s) => s.generating || (s.status === 'not_started' && s.stage !== 'consumer_court')
    )
    if (!pending) return
    const timer = setTimeout(() => {
      void fetchStages()
    }, 4000)
    return () => clearTimeout(timer)
  }, [stages, paid, fetchStages])

  const downloadArtifact = useCallback(async (artifactId: string) => {
    try {
      const res = await fetch(`/api/artifacts/${artifactId}/download`)
      const data = (await res.json()) as { signedUrl?: string; error?: string }
      if (!res.ok || !data.signedUrl) {
        setError(data.error ?? "We couldn't fetch that document. Please try again.")
        return
      }
      window.open(data.signedUrl, '_blank', 'noopener')
    } catch {
      setError("We couldn't fetch that document. Please try again.")
    }
  }, [])

  const lastStage: StageWithArtifacts | null =
    stages && stages.length > 0
      ? [...stages].sort(
          (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
        )[stages.length - 1]
      : null
  const advanceTarget = lastStage ? nextStage(lastStage.stage) : null

  const handleAdvance = useCallback(async () => {
    if (!advanceTarget) return
    setAdvanceBusy(true)
    setAdvanceError(null)
    try {
      if (advanceFile) {
        const formData = new FormData()
        formData.append('file', advanceFile)
        formData.append('doc_type', 'prior_correspondence')
        const docRes = await fetch(`/api/cases/${caseId}/documents`, {
          method: 'POST',
          body: formData,
        })
        if (!docRes.ok) {
          const docData = (await docRes.json()) as { error?: string }
          setAdvanceError(docData.error ?? "We couldn't upload that file. Please try again.")
          setAdvanceBusy(false)
          return
        }
      }
      const res = await fetch(`/api/cases/${caseId}/stages/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStage: advanceTarget }),
      })
      const data = (await res.json()) as { advanced?: boolean; error?: string }
      if (!res.ok || !data.advanced) {
        setAdvanceError(data.error ?? "We couldn't advance your case. Please try again.")
        setAdvanceBusy(false)
        return
      }
      setAdvanceOpen(false)
      setAdvanceFile(null)
      await fetchStages()
    } catch {
      setAdvanceError('Something went wrong. Please try again.')
    } finally {
      setAdvanceBusy(false)
    }
  }, [advanceTarget, advanceFile, caseId, fetchStages])

  if (!paid) {
    return (
      <div className="rounded-2xl border border-rule bg-paper px-6 py-6 shadow-lift">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
          Dispute timeline
        </p>
        <p className="font-sans text-sm leading-relaxed text-slate">
          Your escalation timeline unlocks with the one-time payment for this case.
        </p>
        <Link
          href={`/pay/${caseId}`}
          className="mt-4 inline-block rounded-full bg-blue px-6 py-3 font-sans text-sm font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep"
        >
          ₹299 unlocks the full dispute engine — every stage, every letter
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
        Dispute timeline
      </p>

      {error && (
        <div className="rounded-xl border border-coral bg-coral/10 px-4 py-3">
          <p className="font-sans text-sm text-coral-deep">{error}</p>
        </div>
      )}

      {!stages && !error && (
        <div className="rounded-2xl border border-rule bg-paper px-6 py-6 shadow-lift">
          <p className="font-sans text-sm text-slate">Loading your timeline…</p>
        </div>
      )}

      {stages && stages.length === 0 && (
        <div className="rounded-2xl border border-rule bg-paper px-6 py-6 shadow-lift">
          <p className="font-sans text-sm leading-relaxed text-slate">
            Your first stage appears here once your dispute letter is ready.{' '}
            <Link href={`/download/${caseId}`} className="font-medium text-blue hover:text-blue-deep">
              Check your letter →
            </Link>
          </p>
        </div>
      )}

      {stages &&
        STAGE_ORDER.map((stageName) => {
          const stage = stages.find((s) => s.stage === stageName)

          if (!stage) {
            return (
              <div
                key={stageName}
                className="rounded-2xl border border-rule bg-paper/60 px-6 py-4 opacity-60"
              >
                <div className="flex items-center justify-between">
                  <p className="font-display text-base font-semibold text-slate-muted">
                    {STAGE_LABELS[stageName]}
                  </p>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-faint">
                    Not yet reached
                  </span>
                </div>
              </div>
            )
          }

          const isPreparing =
            stage.generating || (stage.status === 'not_started' && stage.stage !== 'consumer_court')

          return (
            <div
              key={stageName}
              className="rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Link
                  href={`/vault/${caseId}/stages/${stage.stage}`}
                  className="font-display text-lg font-semibold text-ink-deep transition-colors hover:text-blue"
                >
                  {STAGE_LABELS[stage.stage]} →
                </Link>
                <StatusChip status={stage.status} />
              </div>

              {isPreparing ? (
                <div className="mt-4 flex items-center gap-3">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky border-t-blue" />
                  <p className="font-sans text-sm text-slate">
                    Preparing your {STAGE_LABELS[stage.stage]} documents… this takes about a
                    minute.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-3">
                    <DeadlineChip date={stage.deadlineDate} label={stage.deadlineLabel} />
                  </div>

                  {stage.artifacts.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {stage.artifacts.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => void downloadArtifact(a.id)}
                          className="rounded-full border border-rule-strong bg-paper px-4 py-2 font-sans text-xs font-semibold text-blue-deep shadow-sm transition-colors hover:border-blue/40 hover:text-blue"
                        >
                          ↓ {ARTIFACT_LABELS[a.type]}
                        </button>
                      ))}
                    </div>
                  )}

                  {stage.generationDecision && (
                    <div className="mt-4">
                      <DecisionCard
                        decision={stage.generationDecision}
                        reason={stage.generationReason}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}

      {stages && lastStage && advanceTarget && (
        <div className="rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift">
          {!advanceOpen ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-sans text-sm leading-relaxed text-slate">
                Insurer didn&apos;t come through at this stage? Take it to the next one.
              </p>
              <button
                onClick={() => setAdvanceOpen(true)}
                className="rounded-full bg-blue px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep"
              >
                Advance to {STAGE_LABELS[advanceTarget]}
              </button>
            </div>
          ) : (
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
                Next: {STAGE_LABELS[advanceTarget]}
              </p>
              <p className="font-sans text-sm leading-relaxed text-slate">
                {NEXT_STAGE_EXPLAINERS[advanceTarget]}
              </p>
              {advanceTarget === 'ombudsman' && rejectionDate && (
                <p className="mt-2 font-sans text-xs leading-relaxed text-slate-muted">
                  Remember: the ombudsman accepts complaints within 1 year of your rejection.
                </p>
              )}

              <label className="mt-4 block">
                <span className="mb-1 block font-sans text-xs font-medium text-slate">
                  Add your insurer&apos;s reply first (recommended)
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(e) => setAdvanceFile(e.target.files?.[0] ?? null)}
                  className="block w-full font-sans text-xs text-slate file:mr-3 file:rounded-full file:border file:border-rule-strong file:bg-paper file:px-4 file:py-2 file:font-sans file:text-xs file:font-semibold file:text-blue-deep"
                />
              </label>

              {advanceError && (
                <div className="mt-3 rounded-xl border border-coral bg-coral/10 px-4 py-3">
                  <p className="font-sans text-sm text-coral-deep">{advanceError}</p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={() => void handleAdvance()}
                  disabled={advanceBusy}
                  className="rounded-full bg-blue px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {advanceBusy ? 'Advancing…' : `Yes, advance to ${STAGE_LABELS[advanceTarget]}`}
                </button>
                <button
                  onClick={() => {
                    setAdvanceOpen(false)
                    setAdvanceError(null)
                  }}
                  disabled={advanceBusy}
                  className="rounded-full border border-rule-strong bg-paper px-5 py-2.5 font-sans text-sm font-semibold text-slate transition-colors hover:text-ink disabled:opacity-60"
                >
                  Not yet
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
