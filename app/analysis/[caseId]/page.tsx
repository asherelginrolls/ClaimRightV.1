'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { AnalyseResponse } from '@/types/api'

function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

// ── Radial progress arc (SVG, no chart library) ─────────────────────────────
// 270° arc: starts at 135° (bottom-left), sweeps clockwise to 45° (bottom-right).
// stroke-dashoffset shrinks as score increases.
function RadialScore({ score }: { score: number }) {
  const r = 48
  const cx = 60
  const cy = 60
  // Full 270° sweep = 3/4 of circumference
  const circumference = 2 * Math.PI * r
  const arcLength = circumference * 0.75 // 270° of the circle
  const filled = arcLength * (score / 100)
  const gap = arcLength - filled

  // Color by band
  let strokeColor = '#9B4B2A' // low — terracotta
  if (score >= 70) strokeColor = '#1f3b2a' // strong — forest
  else if (score >= 40) strokeColor = '#d97706' // medium — amber

  // Rotate so arc starts at 135° (clockwise from top = 90° start − 45° offset)
  // SVG zero-angle is 3 o'clock; 135° from 3 o'clock = 225° from top.
  // We rotate the whole thing so the gap is centered at the bottom.
  const rotation = 135

  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
      <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#e5e0d8"
          strokeWidth="10"
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${cx} ${cy})`}
        />
        {/* Fill */}
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
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      {/* Numeric label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-2xl font-semibold text-ink leading-none">{score}</span>
        <span className="font-mono text-[9px] tracking-widest text-ink/40 uppercase mt-0.5">/100</span>
      </div>
    </div>
  )
}

const bandConfig = {
  strong: {
    label: 'Strong Case',
    labelColor: 'text-[#1f3b2a]',
    badgeBg: 'bg-[#1f3b2a]',
    badgeText: 'text-white',
  },
  medium: {
    label: 'Worth Fighting',
    labelColor: 'text-amber-700',
    badgeBg: 'bg-amber-600',
    badgeText: 'text-white',
  },
  low: {
    label: 'Difficult Case',
    labelColor: 'text-[#9B4B2A]',
    badgeBg: 'bg-[#9B4B2A]',
    badgeText: 'text-white',
  },
}

function LoadingState() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center">
      <div className="h-10 w-10 rounded-full border-4 border-rule border-t-forest animate-spin" />
      <div>
        <p className="font-serif text-xl text-ink">Analysing your document...</p>
        <p className="mt-2 font-mono text-xs text-ink/50 tracking-wide">
          Reading IRDAI regulations · Checking ombudsman awards · Calculating your score
        </p>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8">
        <p className="font-serif text-lg font-semibold text-red-800">Analysis failed</p>
        <p className="mt-2 font-sans text-sm text-red-700">{message}</p>
        <Link
          href="/upload"
          className="mt-6 inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-4 py-2 font-sans text-sm font-medium text-red-800 hover:bg-red-50 transition-colors"
        >
          ← Try again
        </Link>
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

  useEffect(() => {
    async function fetchAnalysis() {
      try {
        const res = await fetch(`/api/analyse?caseId=${caseId}`)
        const data = await res.json() as AnalyseResponse & { error?: string }
        if (!res.ok || data.error) {
          setError(data.error ?? 'Analysis failed. Please try again.')
        } else {
          setResult(data)
        }
      } catch {
        setError('Could not reach the server. Please check your connection.')
      } finally {
        setLoading(false)
      }
    }

    if (caseId) fetchAnalysis()
  }, [caseId])

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-parchment py-14 px-6">
      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && result && <ResultView result={result} caseId={caseId} />}
    </main>
  )
}

function ResultView({ result, caseId }: { result: AnalyseResponse; caseId: string }) {
  const band = result.fightabilityScore
  const config = bandConfig[band]
  const numericScore = result.fightabilityNumeric ?? 40
  const evidenceSummaries = result.evidenceSummaries ?? []
  const regulationCount = result.regulationMatchCount ?? evidenceSummaries.filter((e) => e.tier === 1).length
  const precedentCount = result.precedentMatchCount ?? evidenceSummaries.filter((e) => e.tier === 2).length

  return (
    <div className="mx-auto max-w-2xl">
      {/* Back link */}
      <Link
        href="/upload"
        className="inline-flex items-center gap-1 font-mono text-xs text-ink/50 hover:text-ink transition-colors mb-8"
      >
        ← Upload another
      </Link>

      {/* ── 1. Numeric score hero ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-rule bg-cream px-8 py-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
          <RadialScore score={numericScore} />
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start mb-2">
              <span
                className={`rounded-full px-3 py-1 font-mono text-xs font-semibold tracking-wide ${config.badgeBg} ${config.badgeText}`}
              >
                {config.label}
              </span>
            </div>
            <p className={`font-serif text-2xl font-semibold leading-tight ${config.labelColor}`}>
              {numericScore} / 100 — {config.label}
            </p>
            {result.insurer && (
              <p className="mt-1 font-sans text-sm text-ink/60">
                {result.insurer}
                {result.claimAmount !== null && (
                  <> · {formatRupees(result.claimAmount)}</>
                )}
              </p>
            )}
            {!result.insurer && result.claimAmount !== null && (
              <p className="mt-1 font-sans text-sm text-ink/60">
                Claim: {formatRupees(result.claimAmount)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. Regulation / precedent counters ────────────────────────────── */}
      {(regulationCount > 0 || precedentCount > 0) && (
        <div className="mt-4 rounded-xl border border-forest/20 bg-forest/5 px-6 py-4 text-center">
          <p className="font-sans text-sm font-medium text-forest">
            We matched{' '}
            {regulationCount > 0 && (
              <strong>
                {regulationCount} IRDAI regulation{regulationCount !== 1 ? 's' : ''}
              </strong>
            )}
            {regulationCount > 0 && precedentCount > 0 && ' and '}
            {precedentCount > 0 && (
              <strong>
                {precedentCount} ombudsman precedent{precedentCount !== 1 ? 's' : ''}
              </strong>
            )}{' '}
            to your case.
          </p>
        </div>
      )}

      {/* ── 3. Evidence cards (visible) ───────────────────────────────────── */}
      {evidenceSummaries.length > 0 && (
        <div className="mt-8">
          <p className="font-mono text-[10px] tracking-widest text-ink/40 uppercase mb-4">
            Regulations &amp; precedents matched to your case
          </p>
          <div className="flex flex-col gap-3">
            {evidenceSummaries.map((ev, i) => (
              <div key={i} className="rounded-xl border border-rule bg-cream px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-sans text-sm font-medium text-ink leading-snug">
                      {ev.source_title}
                      {ev.section_number && (
                        <span className="font-mono text-xs text-ink/50"> §{ev.section_number}</span>
                      )}
                    </p>
                    <p className="mt-1.5 font-sans text-sm text-ink/70 leading-relaxed">
                      {ev.explainer}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] tracking-wide ${
                      ev.tier === 1
                        ? 'bg-forest/10 text-forest'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {ev.tier === 1 ? 'IRDAI Reg' : 'Precedent'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. Blurred preview block ──────────────────────────────────────── */}
      <div className="mt-8 relative overflow-hidden rounded-2xl border border-rule">
        {/* Blurred content underneath */}
        <div
          className="pointer-events-none select-none px-6 py-6"
          style={{ filter: 'blur(8px)', userSelect: 'none' }}
          aria-hidden="true"
        >
          <p className="font-mono text-[10px] tracking-widest text-ink/40 uppercase mb-3">
            Full point-by-point regulation analysis
          </p>
          <div className="flex flex-col gap-2 mb-5">
            {['Your insurer violated §5.3 — cashless pre-authorization must be granted within 1 hour.',
              'GRO response due within 15 days of this complaint letter.',
              'Ombudsman win-rate for documentation rejections: 78% in FY2024.'].map((line, i) => (
              <div key={i} className="rounded-lg bg-rule/60 px-4 py-3">
                <p className="font-sans text-sm text-ink">{line}</p>
              </div>
            ))}
          </div>
          <p className="font-mono text-[10px] tracking-widest text-ink/40 uppercase mb-3">
            Your custom dispute letter (preview)
          </p>
          <div className="rounded-lg border border-rule bg-white px-5 py-4">
            <p className="font-sans text-sm text-ink leading-relaxed">
              To, The Grievance Redressal Officer, [Insurer Name]. I write to formally dispute the
              repudiation of my health insurance claim dated [date] on grounds of [reason], which is
              not in accordance with IRDAI regulations as detailed below...
            </p>
          </div>
        </div>

        {/* Locked overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-parchment/60 px-6 text-center">
          <div className="rounded-full border border-rule bg-cream p-3 mb-3">
            <svg
              className="h-5 w-5 text-ink/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <p className="font-sans text-sm font-semibold text-ink">Full analysis locked</p>
          <p className="mt-1 font-sans text-xs text-ink/50 max-w-xs">
            Unlock the complete regulation breakdown, applicable deadlines, and your custom dispute letter.
          </p>
        </div>
      </div>

      {/* ── 5. CTA ───────────────────────────────────────────────────────────── */}
      <div className="mt-8">
        <Link
          href={`/pay/${caseId}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest px-6 py-5 font-sans text-base font-semibold text-white shadow-md hover:bg-forest/90 transition-colors"
        >
          Unlock full analysis + formal dispute letter — ₹99
          <span aria-hidden>→</span>
        </Link>

        {band === 'low' && (
          <p className="mt-3 text-center font-sans text-xs text-ink/50 leading-relaxed">
            Cases graded &lsquo;Difficult&rsquo; still receive a complete formal GRO letter
            with applicable procedural rights and escalation steps.
          </p>
        )}
      </div>

      {/* ── 6. Trust strip ───────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {[
          '94.5% ombudsman resolution rate',
          'IRDAI-cited sources only',
          'No success fee',
          'One-time ₹99 · No subscription',
        ].map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-rule bg-cream px-3 py-1 font-mono text-[10px] tracking-wide text-ink/50"
          >
            {chip}
          </span>
        ))}
      </div>

      {/* Disclaimer */}
      <p className="mt-8 text-center font-sans text-xs text-ink/30 leading-relaxed">
        All analysis is based on verified IRDAI circulars and ombudsman awards.
        This is not legal advice.
      </p>
    </div>
  )
}
