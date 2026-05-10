'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { AnalyseResponse } from '@/types/api'

function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

const scoreConfig = {
  strong: {
    label: 'Strong Case',
    bg: 'bg-forest',
    text: 'text-white',
    explainer: 'We found clear IRDAI violations in your rejection.',
  },
  medium: {
    label: 'Worth Fighting',
    bg: 'bg-amber-600',
    text: 'text-white',
    explainer: 'We found relevant regulations that may apply to your case.',
  },
  low: {
    label: 'Difficult Case',
    bg: 'bg-[#9B4B2A]',
    text: 'text-white',
    explainer: "We couldn't find a specific IRDAI regulation that was violated.",
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
  const score = result.fightabilityScore
  const config = scoreConfig[score]

  return (
    <div className="mx-auto max-w-2xl">
      {/* Back link */}
      <Link
        href="/upload"
        className="inline-flex items-center gap-1 font-mono text-xs text-ink/50 hover:text-ink transition-colors mb-8"
      >
        ← Upload another
      </Link>

      {/* Score badge */}
      <div className={`rounded-2xl ${config.bg} ${config.text} px-8 py-8 text-center`}>
        <p className="font-mono text-xs tracking-widest opacity-70 uppercase mb-2">
          Fightability Score
        </p>
        <p className="font-serif text-4xl font-semibold">{config.label}</p>
        <p className="mt-2 font-sans text-sm opacity-80">{config.explainer}</p>
      </div>

      {/* Case summary */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-rule bg-cream px-5 py-4">
          <p className="font-mono text-[10px] tracking-widest text-ink/40 uppercase">
            Insurer
          </p>
          <p className="mt-1 font-sans text-base font-medium text-ink">
            {result.insurer ?? 'Not detected'}
          </p>
        </div>
        <div className="rounded-xl border border-rule bg-cream px-5 py-4">
          <p className="font-mono text-[10px] tracking-widest text-ink/40 uppercase">
            Claim Amount
          </p>
          <p className="mt-1 font-sans text-base font-medium text-ink">
            {result.claimAmount !== null ? formatRupees(result.claimAmount) : 'Not detected'}
          </p>
        </div>
      </div>

      {/* Fightability reasons */}
      {result.fightabilityReasons.length > 0 && (
        <div className="mt-8">
          <p className="font-mono text-[10px] tracking-widest text-ink/40 uppercase mb-4">
            Why we scored it this way
          </p>
          <div className="flex flex-col gap-3">
            {result.fightabilityReasons.map((r, i) => (
              <div
                key={i}
                className="rounded-xl border border-rule bg-cream px-5 py-4"
              >
                <p className="font-sans text-sm text-ink leading-relaxed">{r.reason}</p>
                {r.citation && (
                  <span className="mt-2 inline-block rounded-md border border-forest/20 bg-forest/5 px-2.5 py-1 font-mono text-[11px] text-forest">
                    {r.citation}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What happens next */}
      <div className="mt-8 rounded-xl border border-rule bg-cream px-6 py-5">
        <p className="font-mono text-[10px] tracking-widest text-ink/40 uppercase mb-2">
          What your dispute letter includes
        </p>
        <p className="font-sans text-sm text-ink/70 leading-relaxed">
          Your letter cites the exact IRDAI regulations your insurer violated,
          and walks you through GRO → IGMS → Insurance Ombudsman filing step by
          step. Ombudsman filing is free, and 94.5% of cases are resolved.
        </p>
      </div>

      {/* CTA */}
      <div className="mt-8">
        <Link
          href={`/pay/${caseId}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest px-6 py-5 font-sans text-base font-semibold text-white shadow-md hover:bg-forest/90 transition-colors"
        >
          Get Your Dispute Letter — ₹99
          <span aria-hidden>→</span>
        </Link>

        {score === 'low' && (
          <p className="mt-3 text-center font-sans text-xs text-ink/50 leading-relaxed">
            Cases graded &lsquo;Difficult&rsquo; often lack a clear IRDAI regulatory
            match. The dispute letter will still include relevant policy sections
            and filing steps.
          </p>
        )}
      </div>

      {/* Disclaimer */}
      <p className="mt-10 text-center font-sans text-xs text-ink/30 leading-relaxed">
        All analysis is based on verified IRDAI circulars and ombudsman awards.
        This is not legal advice.
      </p>
    </div>
  )
}
