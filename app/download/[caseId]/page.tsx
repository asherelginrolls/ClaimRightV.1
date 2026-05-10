'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface DownloadReadyResponse {
  pending: false
  signedUrl: string
  caseId: string
  status: string
}

interface DownloadPendingResponse {
  pending: true
  status: string
}

type DownloadResponse = DownloadReadyResponse | DownloadPendingResponse

const NEXT_STEPS = [
  {
    step: '01',
    title: 'File with GRO',
    body: 'Email or post your dispute letter to your insurer\'s Grievance Redressal Officer. They must respond within 15 days.',
  },
  {
    step: '02',
    title: 'Escalate to IGMS',
    body: 'No satisfactory response in 15 days? File at bimabharosa.irdai.gov.in using the reference number from your insurer.',
  },
  {
    step: '03',
    title: 'Go to the Ombudsman',
    body: 'Still unresolved? File at cioins.co.in — it\'s free, takes 1–3 months, and 94.5% of cases are resolved in the policyholder\'s favour.',
  },
]

function Spinner() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center">
      <div className="h-10 w-10 rounded-full border-4 border-rule border-t-forest animate-spin" />
      <div>
        <p className="font-serif text-xl text-ink">Generating your dispute letter…</p>
        <p className="mt-2 font-mono text-xs text-ink/50 tracking-wide">
          Verifying citations · Checking regulations · Building your PDF
        </p>
        <p className="mt-1 font-mono text-[10px] text-ink/30">This usually takes 30–60 seconds</p>
      </div>
    </div>
  )
}

export default function DownloadPage() {
  const params = useParams()
  const caseId = params.caseId as string

  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!caseId) return

    async function poll() {
      try {
        const res = await fetch(`/api/download/${caseId}`)
        if (!res.ok) {
          const d = (await res.json()) as { error?: string }
          setError(d.error ?? 'Could not load your letter. Please try again.')
          clearInterval(intervalRef.current!)
          return
        }

        const data = (await res.json()) as DownloadResponse

        if (!data.pending) {
          setSignedUrl(data.signedUrl)
          clearInterval(intervalRef.current!)
        }
        // else: still generating — keep polling
      } catch {
        setError('Could not reach the server. Please refresh the page.')
        clearInterval(intervalRef.current!)
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 3000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [caseId])

  if (error) {
    return (
      <main className="min-h-[calc(100vh-8rem)] bg-parchment py-14 px-6">
        <div className="mx-auto max-w-md py-10 text-center">
          <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8">
            <p className="font-serif text-lg font-semibold text-red-800">Something went wrong</p>
            <p className="mt-2 font-sans text-sm text-red-700">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-4 py-2 font-sans text-sm font-medium text-red-800 hover:bg-red-50 transition-colors"
            >
              Refresh page
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (!signedUrl) {
    return (
      <main className="min-h-[calc(100vh-8rem)] bg-parchment py-14 px-6">
        <Spinner />
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-parchment py-14 px-6">
      <div className="mx-auto max-w-xl">
        {/* Success header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-forest/10">
            <svg
              className="h-7 w-7 text-forest"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="font-serif text-3xl font-semibold text-ink">
            Your dispute letter is ready.
          </h1>
          <p className="mt-3 font-sans text-sm text-ink/60">
            It's been sent to your email too. Download it below to get started.
          </p>
        </div>

        {/* Download card */}
        <div className="rounded-xl border border-rule bg-cream px-6 py-6 mb-8">
          <p className="font-mono text-[10px] tracking-widest text-ink/40 uppercase mb-4">
            Your dispute letter
          </p>
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest px-6 py-4 font-sans text-base font-semibold text-white shadow-md hover:bg-forest/90 transition-colors"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            Download Dispute Letter PDF
          </a>
          <p className="mt-3 text-center font-mono text-[10px] tracking-wide text-ink/30">
            Download link expires in 1 hour · Also sent to your email
          </p>
        </div>

        {/* What to do next */}
        <div className="mb-8">
          <p className="font-mono text-[10px] tracking-widest text-ink/40 uppercase mb-4">
            What to do next
          </p>
          <div className="flex flex-col gap-4">
            {NEXT_STEPS.map((s) => (
              <div key={s.step} className="rounded-xl border border-rule bg-cream px-5 py-4">
                <div className="flex items-start gap-4">
                  <span className="font-mono text-xs font-medium text-forest/60 flex-shrink-0 pt-0.5">
                    {s.step}
                  </span>
                  <div>
                    <p className="font-sans text-sm font-semibold text-ink">{s.title}</p>
                    <p className="mt-1 font-sans text-sm text-ink/60 leading-relaxed">{s.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upload another */}
        <div className="text-center">
          <Link
            href="/upload"
            className="font-sans text-sm text-ink/50 hover:text-ink transition-colors underline underline-offset-2"
          >
            Have another rejection letter? Upload it →
          </Link>
        </div>

        {/* Disclaimer */}
        <p className="mt-10 text-center font-sans text-xs text-ink/30 leading-relaxed">
          All citations are verified against official IRDAI circulars and ombudsman awards.
          This is not legal advice.
        </p>
      </div>
    </main>
  )
}
