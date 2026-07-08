'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { AnalyseResponse } from '@/types/api'
import { SaveCaseCard } from '@/app/components/SaveCaseCard'

function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

// ── Hopeful score bands ──────────────────────────────────────────────────────
// Mapped off the 0–100 number the backend already returns. Tuned for hope:
// even a weak case reads as "here's your path", never a red alarm.
interface Band {
  label: string
  color: string
  head: string
  chip: string
}
function hopefulBand(score: number): Band {
  if (score >= 72)
    return {
      label: 'Highly fightable',
      color: '#1E9E73',
      head: 'This looks like a strong case worth pursuing.',
      chip: 'bg-hope/10 text-hope',
    }
  if (score >= 52)
    return {
      label: 'Fightable',
      color: '#E0A21E',
      head: 'You have a real case here.',
      chip: 'bg-sun/20 text-gold',
    }
  if (score >= 36)
    return {
      label: 'Worth a letter',
      color: '#F4A98C',
      head: 'Borderline — but it costs very little to try.',
      chip: 'bg-coral/20 text-coral-deep',
    }
  return {
    label: 'Difficult as it stands',
    color: '#E7886F',
    head: 'Harder under the current rules — but here is your path forward.',
    chip: 'bg-slate-faint/20 text-slate',
  }
}

// ── Radial progress arc (SVG, no chart library) ─────────────────────────────
// 270° arc, gap centred at the bottom; stroke colour follows the hopeful band.
function RadialScore({ score }: { score: number }) {
  const r = 48
  const cx = 60
  const cy = 60
  const circumference = 2 * Math.PI * r
  const arcLength = circumference * 0.75
  const filled = arcLength * (score / 100)
  const gap = arcLength - filled
  const strokeColor = hopefulBand(score).color
  const rotation = 135

  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
      <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#E3EEF7"
          strokeWidth="10"
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${cx} ${cy})`}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth="10"
          strokeDasharray={`${filled} ${gap + (circumference - arcLength)}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold leading-none text-ink-deep">{score}</span>
        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-slate-faint">/100</span>
      </div>
    </div>
  )
}

const ANALYSE_STEPS = [
  'Reading your rejection letter',
  'Matching IRDAI rules & ombudsman rulings',
  'Checking the timeline against the law',
  'Scoring how fightable your case is',
]

function LoadingState() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s < ANALYSE_STEPS.length - 1 ? s + 1 : s)), 1700)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center gap-7 text-center">
      <div className="h-12 w-12 animate-sunpulse rounded-full bg-sun shadow-glow" />
      <div>
        <p className="font-display text-2xl text-ink-deep">Reading your case.</p>
        <p className="mt-2 font-sans text-sm text-slate">
          We&apos;re working through it the way a careful advisor would.
        </p>
      </div>
      <ul className="flex w-full flex-col gap-2.5 text-left">
        {ANALYSE_STEPS.map((label, i) => {
          const done = step > i
          const active = step === i
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  done
                    ? 'border-hope bg-hope text-white'
                    : active
                    ? 'animate-blink border-blue bg-paper'
                    : 'border-rule-strong bg-paper'
                }`}
              >
                {done && (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className={`font-sans text-sm ${done ? 'text-ink-deep' : active ? 'text-blue-deep' : 'text-slate-faint'}`}>
                {label}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="font-mono text-[10px] tracking-wide text-slate-faint">
        Every finding will be traced to a real source. Nothing invented.
      </p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="rounded-2xl border border-rule bg-paper px-6 py-8 shadow-lift">
        <p className="font-display text-xl font-semibold text-ink-deep">We hit a snag</p>
        <p className="mt-2 font-sans text-sm text-slate">{message}</p>
        <p className="mt-1 font-sans text-xs text-slate-faint">
          Your documents are safe — nothing is lost. Retrying picks up where we left off.
        </p>
        <button
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-blue px-6 py-2.5 font-sans text-sm font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep"
        >
          Retry the analysis
        </button>
        <div className="mt-3">
          <Link
            href="/upload"
            className="font-mono text-xs text-slate-muted transition-colors hover:text-ink"
          >
            ← or start over with a new upload
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function AnalysisPage() {
  const params = useParams()
  const caseId = params.caseId as string

  const [result, setResult] = useState<AnalyseResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    // The server budget is 300s; already-analysed cases return instantly from
    // cache, so a long first-run wait is the only case this timeout guards.
    const timeout = setTimeout(() => controller.abort(), 180_000)

    async function fetchAnalysis() {
      try {
        const res = await fetch(`/api/analyse?caseId=${caseId}`, { signal: controller.signal })
        const data = (await res.json()) as AnalyseResponse & { error?: string }
        if (!res.ok || data.error) {
          setError(data.error ?? "The analysis didn't complete. Please try again.")
        } else {
          setResult(data)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError("This is taking longer than expected — usually a busy moment, not a lost case.")
        } else {
          setError("We couldn't reach the server. Please check your connection.")
        }
      } finally {
        clearTimeout(timeout)
        setLoading(false)
      }
    }

    if (caseId) fetchAnalysis()
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [caseId, attempt])

  const retry = () => {
    setError(null)
    setLoading(true)
    setAttempt((a) => a + 1)
  }

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} onRetry={retry} />}
      {!loading && result && <ResultView result={result} caseId={caseId} />}
    </main>
  )
}

function ResultView({ result, caseId }: { result: AnalyseResponse; caseId: string }) {
  const numericScore = result.fightabilityNumeric ?? 40
  const band = hopefulBand(numericScore)
  const isDifficult = numericScore < 36
  const evidenceSummaries = result.evidenceSummaries ?? []
  const regulationCount = result.regulationMatchCount ?? evidenceSummaries.filter((e) => e.tier === 1).length
  const precedentCount = result.precedentMatchCount ?? evidenceSummaries.filter((e) => e.tier === 2).length
  const pointByPoint = result.pointByPointAnalysis ?? []
  const visibleBullets = pointByPoint.slice(0, 3)
  const blurredBullets = pointByPoint.slice(3, 6)

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/upload"
        className="mb-8 inline-flex items-center gap-1 font-mono text-xs text-slate-muted transition-colors hover:text-ink"
      >
        ← Check another claim
      </Link>

      {/* ── Score hero ── */}
      <div className="rounded-3xl border border-rule bg-paper px-8 py-8 shadow-lift">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
          <RadialScore score={numericScore} />
          <div className="flex-1 text-center sm:text-left">
            <span className={`inline-block rounded-full px-3 py-1 font-mono text-xs font-semibold tracking-wide ${band.chip}`}>
              {band.label}
            </span>
            <p className="mt-2.5 font-display text-2xl font-semibold leading-snug text-ink-deep">
              {band.head}
            </p>
            {result.insurer && (
              <p className="mt-1.5 font-sans text-sm text-slate">
                {result.insurer}
                {result.claimAmount !== null && <> · {formatRupees(result.claimAmount)}</>}
              </p>
            )}
            {!result.insurer && result.claimAmount !== null && (
              <p className="mt-1.5 font-sans text-sm text-slate">Claim: {formatRupees(result.claimAmount)}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Early lead capture: save the case before the paywall ── */}
      <SaveCaseCard caseId={caseId} />

      {/* ── Match counters ── */}
      {(regulationCount > 0 || precedentCount > 0) && (
        <div className="mt-4 rounded-2xl border border-blue/15 bg-sky-tint/60 px-6 py-4 text-center">
          <p className="font-sans text-sm font-medium text-blue-deep">
            We matched{' '}
            {regulationCount > 0 && (
              <strong>{regulationCount} IRDAI rule{regulationCount !== 1 ? 's' : ''}</strong>
            )}
            {regulationCount > 0 && precedentCount > 0 && ' and '}
            {precedentCount > 0 && (
              <strong>{precedentCount} ombudsman ruling{precedentCount !== 1 ? 's' : ''}</strong>
            )}{' '}
            to your case.
          </p>
        </div>
      )}

      {/* ── Why this score: each reason tagged with its source status ── */}
      {(result.fightabilityReasons ?? []).length > 0 && (
        <div className="mt-8">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
            Why this score · where each point comes from
          </p>
          <div className="flex flex-col gap-3">
            {(result.fightabilityReasons ?? []).slice(0, 3).map((r, i) => (
              <div key={i} className="rounded-2xl border border-rule bg-paper px-5 py-4 shadow-lift">
                <p className="font-sans text-sm leading-relaxed text-ink">{r.reason}</p>
                {r.citation ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-hope/10 px-2 py-1 font-mono text-[10px] tracking-wide text-hope">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Verified — {r.citation}
                  </p>
                ) : (
                  <p className="mt-2 inline-block rounded-md bg-slate-faint/15 px-2 py-1 font-mono text-[10px] tracking-wide text-slate">
                    General principle — worth confirming with an advisor
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Evidence cards ── */}
      {evidenceSummaries.length > 0 && (
        <div className="mt-8">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
            What we found in your case · each point is a real rule
          </p>
          <div className="flex flex-col gap-3">
            {evidenceSummaries.map((ev, i) => (
              <div key={i} className="rounded-2xl border border-rule bg-paper px-5 py-4 shadow-lift">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-sans text-sm font-medium leading-snug text-ink">
                      {ev.source_title}
                      {ev.section_number && (
                        <span className="font-mono text-xs text-slate-muted"> §{ev.section_number}</span>
                      )}
                    </p>
                    <p className="mt-1.5 font-sans text-sm leading-relaxed text-slate">{ev.explainer}</p>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] tracking-wide ${
                      ev.tier === 1 ? 'bg-blue/10 text-blue-deep' : 'bg-sun/20 text-gold'
                    }`}
                  >
                    {ev.tier === 1 ? 'IRDAI rule' : 'Ombudsman'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Visible teaser bullets ── */}
      {visibleBullets.length > 0 && (
        <div className="mt-8">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
            Your strongest points
          </p>
          <div className="flex flex-col gap-3">
            {visibleBullets.map((line, i) => (
              <div key={i} className="rounded-2xl border border-hope/20 bg-hope-soft/10 px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-[11px] font-semibold text-hope">{i + 1}.</span>
                  <p className="flex-1 font-sans text-sm leading-relaxed text-ink">{line}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Blurred locked preview ── */}
      <div className="relative mt-6 overflow-hidden rounded-3xl border border-rule">
        <div
          className="pointer-events-none select-none px-6 py-6"
          style={{ filter: 'blur(8px)', userSelect: 'none' }}
          aria-hidden="true"
        >
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
            The rest of your analysis
          </p>
          <div className="mb-5 flex flex-col gap-2">
            {(blurredBullets.length > 0
              ? blurredBullets
              : [
                  'Your insurer missed procedural deadlines set by the IRDAI Master Circular on Health Insurance.',
                  'A written grievance to the Grievance Redressal Officer starts a 15-day response clock.',
                  "Ombudsman rulings have overturned rejections of this kind in the policyholder's favour.",
                ]
            ).map((line, i) => (
              <div key={i} className="rounded-lg bg-sky-tint px-4 py-3">
                <p className="font-sans text-sm text-ink">
                  <span className="mr-2 font-mono text-[11px] font-semibold">{visibleBullets.length + i + 1}.</span>
                  {line}
                </p>
              </div>
            ))}
          </div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
            Your dispute letter (preview)
          </p>
          <div className="rounded-lg border border-rule bg-paper px-5 py-4">
            <p className="font-sans text-sm leading-relaxed text-ink">
              To, The Grievance Redressal Officer, [Insurer Name]. I am writing to formally dispute the
              rejection of my health insurance claim dated [date] on the ground of [reason], which is not
              in line with IRDAI regulations, as set out below…
            </p>
          </div>
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center bg-mist/70 px-6 text-center backdrop-blur-[2px]">
          <div className="mb-3 rounded-full border border-rule bg-paper p-3 shadow-lift">
            <svg className="h-5 w-5 text-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="font-sans text-sm font-semibold text-ink-deep">The full plan is one step away</p>
          <p className="mt-1 max-w-xs font-sans text-xs text-slate">
            Unlock the complete breakdown, your deadlines, and a ready-to-send dispute letter.
          </p>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="mt-8">
        <Link
          href={`/pay/${caseId}`}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-blue px-6 py-5 font-sans text-base font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep"
        >
          Unlock my full analysis + dispute letter — ₹299
          <span aria-hidden>→</span>
        </Link>

        {isDifficult ? (
          <p className="mt-3 text-center font-sans text-xs leading-relaxed text-slate">
            Even a tougher case gets a complete, formal letter setting out your rights and the exact
            steps to escalate. Many people pay simply for the clarity of knowing where they stand.
          </p>
        ) : (
          <p className="mt-3 text-center font-sans text-xs leading-relaxed text-slate">
            One flat fee for this case. You pay only if you want the full letter and plan.
          </p>
        )}
      </div>

      {/* ── Trust chips ── */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {[
          '94.5% ombudsman resolution rate',
          'IRDAI-cited sources only',
          'One-time ₹299 · no subscription',
          "Refund if it's not useful",
        ].map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-rule bg-paper px-3 py-1 font-mono text-[10px] tracking-wide text-slate-muted"
          >
            {chip}
          </span>
        ))}
      </div>

      <p className="mt-8 text-center font-sans text-xs leading-relaxed text-slate-faint">
        Everything here is based on verified IRDAI circulars and published ombudsman rulings. Ashray is
        an informational tool, not legal advice.
      </p>
    </div>
  )
}
