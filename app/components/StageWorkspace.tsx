'use client'

// Workspace for a single escalation stage: status + deadline, artifacts,
// filed/resolved actions, and the guided experiences — the Bima Bharosa
// filing walkthrough, the ombudsman evidence checklist + cc list, and the
// static consumer court guidance.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { STAGE_LABELS, type DisputeStage } from '@/lib/deadlines'
import type { FilingWalkthrough, EvidenceChecklist, CcList } from '@/lib/artifacts'
import {
  ARTIFACT_LABELS,
  DeadlineChip,
  DecisionCard,
  StatusChip,
  type ArtifactType,
  type StagesResponse,
  type StageWithArtifacts,
} from '@/app/components/stage-shared'

interface StageWorkspaceProps {
  caseId: string
  stage: DisputeStage
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — nothing sensible to do beyond staying quiet.
    }
  }, [text])
  return (
    <button
      onClick={() => void copy()}
      className={`flex-shrink-0 rounded-full border px-3 py-1 font-sans text-xs font-semibold transition-colors ${
        copied
          ? 'border-hope/40 bg-hope/10 text-hope'
          : 'border-rule-strong bg-paper text-blue-deep hover:border-blue/40 hover:text-blue'
      }`}
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  )
}

function ConsumerCourtGuidance({ caseId }: { caseId: string }) {
  return (
    <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/vault/${caseId}`}
          className="mb-8 inline-flex items-center gap-1 font-mono text-xs text-slate-muted transition-colors hover:text-ink"
        >
          ← Back to my case
        </Link>

        <div className="mb-8">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-blue">
            The last resort
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink-deep sm:text-4xl">
            Consumer Court
          </h1>
          <p className="mt-3 font-sans text-base leading-relaxed text-slate">
            If the ombudsman route didn&apos;t resolve your dispute, consumer court is the final
            step. It works differently from everything before it — here&apos;s what to know, in
            plain words.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
              You&apos;ll likely need a lawyer
            </p>
            <p className="font-sans text-sm leading-relaxed text-slate">
              Unlike the ombudsman, consumer court proceedings typically involve a lawyer. Look
              for one experienced in insurance or consumer protection matters.
            </p>
          </div>

          <div className="rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
              It takes time
            </p>
            <p className="font-sans text-sm leading-relaxed text-slate">
              Cases usually take 6–18 months to conclude. It&apos;s slower than every earlier
              stage, which is why the ladder puts it last.
            </p>
          </div>

          <div className="rounded-2xl border border-sun bg-sun/10 px-6 py-5">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-gold-ink">
              Mind the deadline
            </p>
            <p className="font-sans text-sm leading-relaxed text-slate">
              There is a 2-year limitation period from the date of your rejection. If you&apos;re
              approaching it, talk to a lawyer sooner rather than later.
            </p>
          </div>

          <div className="rounded-2xl border border-sky bg-sky-tint px-6 py-5">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-blue-deep">
              Carry your full dossier
            </p>
            <p className="font-sans text-sm leading-relaxed text-slate">
              Bring everything Ashray prepared with you: every letter from every stage, your
              insurer&apos;s replies, and the ombudsman outcome. A complete paper trail is your
              strongest asset in court — it shows you followed every step properly.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

export function StageWorkspace({ caseId, stage }: StageWorkspaceProps) {
  const [stages, setStages] = useState<StageWithArtifacts[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [walkthrough, setWalkthrough] = useState<FilingWalkthrough | null>(null)
  const [checklist, setChecklist] = useState<EvidenceChecklist | null>(null)
  const [ccList, setCcList] = useState<CcList | null>(null)
  const [loadedArtifacts, setLoadedArtifacts] = useState<Set<string>>(new Set())

  const isConsumerCourt = stage === 'consumer_court'

  const fetchStages = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}/stages`)
      const data = (await res.json()) as StagesResponse
      if (!res.ok || !data.stages) {
        setError(data.error ?? "We couldn't load this stage. Please refresh the page.")
        return
      }
      setStages(data.stages)
      setError(null)
    } catch {
      setError("We couldn't load this stage. Please refresh the page.")
    }
  }, [caseId])

  useEffect(() => {
    if (isConsumerCourt) return
    void fetchStages()
  }, [fetchStages, isConsumerCourt])

  const stageData = stages?.find((s) => s.stage === stage) ?? null
  const isPreparing =
    stageData !== null && (stageData.generating || stageData.status === 'not_started')

  // Poll every 4s while this stage is generating.
  useEffect(() => {
    if (isConsumerCourt || !isPreparing) return
    const timer = setTimeout(() => {
      void fetchStages()
    }, 4000)
    return () => clearTimeout(timer)
  }, [isPreparing, isConsumerCourt, fetchStages])

  const fetchJsonArtifact = useCallback(async <T,>(artifactId: string): Promise<T | null> => {
    try {
      const res = await fetch(`/api/artifacts/${artifactId}/download`)
      const data = (await res.json()) as { signedUrl?: string; error?: string }
      if (!res.ok || !data.signedUrl) return null
      const fileRes = await fetch(data.signedUrl)
      if (!fileRes.ok) return null
      return (await fileRes.json()) as T
    } catch {
      return null
    }
  }, [])

  // Load the guided-experience JSON artifacts once they exist.
  useEffect(() => {
    if (!stageData) return
    const loadByType = async <T,>(
      type: ArtifactType,
      setter: (value: T) => void
    ): Promise<void> => {
      const artifact = stageData.artifacts.find((a) => a.type === type)
      if (!artifact || loadedArtifacts.has(artifact.id)) return
      setLoadedArtifacts((prev) => new Set(prev).add(artifact.id))
      const parsed = await fetchJsonArtifact<T>(artifact.id)
      if (parsed) setter(parsed)
    }
    if (stage === 'bima_bharosa') {
      void loadByType<FilingWalkthrough>('filing_walkthrough', setWalkthrough)
    }
    if (stage === 'ombudsman') {
      void loadByType<EvidenceChecklist>('evidence_checklist', setChecklist)
      void loadByType<CcList>('cc_list', setCcList)
    }
  }, [stageData, stage, loadedArtifacts, fetchJsonArtifact])

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

  const patchStage = useCallback(
    async (action: 'filed' | 'resolved') => {
      if (!stageData) return
      setActionBusy(true)
      setError(null)
      try {
        const res = await fetch(`/api/cases/${caseId}/stages/${stageData.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const data = (await res.json()) as { updated?: boolean; error?: string }
        if (!res.ok || !data.updated) {
          setError(data.error ?? "We couldn't update this stage. Please try again.")
          return
        }
        await fetchStages()
      } catch {
        setError('Something went wrong. Please try again.')
      } finally {
        setActionBusy(false)
      }
    },
    [caseId, stageData, fetchStages]
  )

  if (isConsumerCourt) return <ConsumerCourtGuidance caseId={caseId} />

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/vault/${caseId}`}
          className="mb-8 inline-flex items-center gap-1 font-mono text-xs text-slate-muted transition-colors hover:text-ink"
        >
          ← Back to my case
        </Link>

        <div className="mb-8">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-blue">
            Dispute stage
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink-deep sm:text-4xl">
            {STAGE_LABELS[stage]}
          </h1>
          {stageData && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusChip status={stageData.status} />
              {!isPreparing && (
                <DeadlineChip date={stageData.deadlineDate} label={stageData.deadlineLabel} />
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-coral bg-coral/10 px-4 py-3">
            <p className="font-sans text-sm text-coral-deep">{error}</p>
          </div>
        )}

        {!stages && !error && (
          <div className="rounded-2xl border border-rule bg-paper px-6 py-6 shadow-lift">
            <p className="font-sans text-sm text-slate">Loading this stage…</p>
          </div>
        )}

        {stages && !stageData && (
          <div className="rounded-2xl border border-rule bg-paper px-6 py-6 shadow-lift">
            <p className="font-sans text-sm leading-relaxed text-slate">
              This stage hasn&apos;t started yet. Head back to your case to see where things
              stand.
            </p>
          </div>
        )}

        {stageData && isPreparing && (
          <div className="rounded-2xl border border-rule bg-paper px-6 py-6 shadow-lift">
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky border-t-blue" />
              <p className="font-sans text-sm text-slate">
                Preparing your {STAGE_LABELS[stage]} documents… this takes about a minute.
              </p>
            </div>
          </div>
        )}

        {stageData && !isPreparing && (
          <div className="flex flex-col gap-6">
            {stageData.generationDecision && (
              <DecisionCard
                decision={stageData.generationDecision}
                reason={stageData.generationReason}
              />
            )}

            {stageData.artifacts.length > 0 && (
              <div className="rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
                  Your documents for this stage
                </p>
                <div className="flex flex-wrap gap-2">
                  {stageData.artifacts.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => void downloadArtifact(a.id)}
                      className="rounded-full border border-rule-strong bg-paper px-4 py-2 font-sans text-xs font-semibold text-blue-deep shadow-sm transition-colors hover:border-blue/40 hover:text-blue"
                    >
                      ↓ {ARTIFACT_LABELS[a.type]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {stage === 'bima_bharosa' && walkthrough && (
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border border-sky bg-sky-tint px-6 py-5">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-blue-deep">
                    Why you file this yourself
                  </p>
                  <p className="font-sans text-sm leading-relaxed text-slate">
                    {walkthrough.trustNote}
                  </p>
                </div>

                {walkthrough.steps.map((step) => (
                  <div
                    key={step.step}
                    className="rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift"
                  >
                    <div className="flex items-start gap-4">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue/10 font-display text-sm font-semibold text-blue-deep">
                        {step.step}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
                          {step.screen}
                        </p>
                        <p className="mt-1.5 font-sans text-sm leading-relaxed text-ink/90">
                          {step.instruction}
                        </p>
                        {step.fields && step.fields.length > 0 && (
                          <div className="mt-4 flex flex-col gap-3">
                            {step.fields.map((field) => (
                              <div key={field.label}>
                                <p className="mb-1 font-sans text-xs font-medium text-slate">
                                  {field.label}
                                </p>
                                {field.value.length > 300 ? (
                                  <div className="rounded-xl border border-rule bg-mist p-3">
                                    <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink/90">
                                      {field.value}
                                    </pre>
                                    <div className="mt-2 flex justify-end">
                                      <CopyButton text={field.value} />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-mist px-3 py-2">
                                    <p className="min-w-0 break-words font-sans text-sm text-ink/90">
                                      {field.value}
                                    </p>
                                    <CopyButton text={field.value} />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {stage === 'ombudsman' && checklist && (
              <div className="rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
                  Evidence checklist
                </p>
                <ul className="flex flex-col gap-3.5">
                  {checklist.items.map((item) => (
                    <li key={item.item} className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full font-sans text-xs font-bold ${
                          item.have ? 'bg-hope/10 text-hope' : 'bg-coral/15 text-coral-deep'
                        }`}
                      >
                        {item.have ? '✓' : '✗'}
                      </span>
                      <div>
                        <p className="font-sans text-sm font-medium text-ink">{item.item}</p>
                        <p className="font-sans text-xs leading-relaxed text-slate">{item.note}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {stage === 'ombudsman' && ccList && (
              <div className="rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
                  Who to send copies to
                </p>
                <div className="flex flex-col gap-4">
                  {ccList.recipients.map((r) => (
                    <div key={r.who}>
                      <p className="font-sans text-sm font-medium text-ink">{r.who}</p>
                      <p className="font-sans text-xs leading-relaxed text-slate">{r.why}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stageData.status === 'drafted' && (
              <button
                onClick={() => void patchStage('filed')}
                disabled={actionBusy}
                className="w-full rounded-full bg-blue px-6 py-4 font-sans text-base font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionBusy ? 'Saving…' : 'I have filed this'}
              </button>
            )}

            {stageData.status === 'awaiting_response' && (
              <div className="rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
                  Filed — now we wait
                </p>
                <p className="font-sans text-sm leading-relaxed text-slate">
                  Well done. The ball is in their court now — we&apos;ll track the response
                  window for you.
                </p>
                <div className="mt-3">
                  <DeadlineChip date={stageData.deadlineDate} label={stageData.deadlineLabel} />
                </div>
                <button
                  onClick={() => void patchStage('resolved')}
                  disabled={actionBusy}
                  className="mt-4 rounded-full border border-rule-strong bg-paper px-5 py-2.5 font-sans text-sm font-semibold text-slate transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionBusy ? 'Saving…' : 'Mark resolved — my claim got settled'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
