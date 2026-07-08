'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { OtpSignIn } from '@/app/components/OtpSignIn'

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
    title: 'Send it to your insurer',
    body: "Email or post your letter to your insurer's Grievance Redressal Officer — the person who must handle complaints. They have 15 days to reply.",
  },
  {
    step: '02',
    title: 'No good reply? Go to the IRDAI portal',
    body: "If 15 days pass without a fair answer, lodge it on the government's Bima Bharosa portal (bimabharosa.irdai.gov.in). Another 15-day clock starts.",
  },
  {
    step: '03',
    title: 'Still stuck? The ombudsman',
    body: "The insurance ombudsman is free, needs no lawyer, and resolved 94.5% of the complaints it received last year. File at cioins.co.in within a year.",
  },
]

function Generating({ takingLong }: { takingLong: boolean }) {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center gap-6 text-center">
      <div className="h-12 w-12 animate-sunpulse rounded-full bg-sun shadow-glow" />
      <div>
        <p className="font-display text-2xl text-ink-deep">Putting your letter together…</p>
        <p className="mt-2 font-mono text-xs tracking-wide text-slate">
          Verifying every citation · Checking the rules · Building your PDF
        </p>
        <p className="mt-1 font-mono text-[10px] text-slate-faint">
          {takingLong
            ? 'Taking a little longer than usual — still working, no action needed'
            : 'This usually takes about two minutes — every legal point is checked against the real rules'}
        </p>
      </div>
    </div>
  )
}

export default function DownloadPage() {
  const params = useParams()
  const caseId = params.caseId as string

  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [takingLong, setTakingLong] = useState(false)
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)
  // Set when we stalled out (~7 min of polling). The next retry's first poll
  // sends ?stuck=1 so the server can reset a dead 'generating' claim even
  // before migration 014's timestamp exists.
  const stalledRef = useRef(false)

  // Polls every 3s. After ~2.5 min switch to "taking longer" copy; after
  // ~7 min (well past the server's 5-min stale-claim auto-retry) stop and
  // surface a retry instead of spinning forever.
  const LONG_AFTER_POLLS = 50
  const STALLED_AFTER_POLLS = 140

  useEffect(() => {
    if (!caseId) return
    pollCountRef.current = 0
    setTakingLong(false)

    async function poll() {
      pollCountRef.current += 1
      if (pollCountRef.current === LONG_AFTER_POLLS) setTakingLong(true)
      if (pollCountRef.current >= STALLED_AFTER_POLLS) {
        stalledRef.current = true
        setError(
          "Generation is taking far longer than it should. Your payment and case are safe — retry below, and the letter will pick up where it left off."
        )
        clearInterval(intervalRef.current!)
        return
      }
      try {
        const stuck = stalledRef.current && pollCountRef.current === 1
        if (stuck) stalledRef.current = false
        const res = await fetch(`/api/download/${caseId}${stuck ? '?stuck=1' : ''}`)
        if (!res.ok) {
          const d = (await res.json()) as { error?: string; code?: string }
          if (res.status === 403 && d.code === 'sign_in_required') {
            // Opened from an email link on a new device — sign in with the
            // case email, claim, and resume.
            setNeedsSignIn(true)
          } else {
            setError(d.error ?? "We couldn't load your letter. Please try again.")
          }
          clearInterval(intervalRef.current!)
          return
        }

        const data = (await res.json()) as DownloadResponse

        if (!data.pending) {
          setSignedUrl(data.signedUrl)
          clearInterval(intervalRef.current!)
        }
      } catch {
        setError("We couldn't reach the server. Please refresh the page.")
        clearInterval(intervalRef.current!)
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 3000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [caseId, attempt])

  if (needsSignIn) {
    return (
      <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
        <div className="mx-auto max-w-md py-10">
          <div className="mb-6 text-center">
            <p className="font-display text-2xl font-semibold text-ink-deep">
              Sign in to open your letter
            </p>
            <p className="mt-2 font-sans text-sm leading-relaxed text-slate">
              Use the email address this case was created with, and we&apos;ll link it to your
              account and open your letter.
            </p>
          </div>
          <OtpSignIn
            onSignedIn={() => {
              void fetch(`/api/cases/${caseId}/claim`, { method: 'POST' }).finally(() => {
                setNeedsSignIn(false)
                setAttempt((a) => a + 1)
              })
            }}
          />
        </div>
      </main>
    )
  }

  // signedUrl wins over error: a long in-flight generation fetch can resolve
  // with the letter after the stall error was set — show the letter.
  if (error && !signedUrl) {
    return (
      <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
        <div className="mx-auto max-w-md py-10 text-center">
          <div className="rounded-2xl border border-rule bg-paper px-6 py-8 shadow-lift">
            <p className="font-display text-xl font-semibold text-ink-deep">Something went wrong</p>
            <p className="mt-2 font-sans text-sm text-slate">{error}</p>
            <button
              onClick={() => {
                setError(null)
                setAttempt((a) => a + 1)
              }}
              className="mt-6 inline-flex items-center gap-1 rounded-full bg-blue px-6 py-2.5 font-sans text-sm font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep"
            >
              Retry
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (!signedUrl) {
    return (
      <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
        <Generating takingLong={takingLong} />
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
      <div className="mx-auto max-w-xl">
        {/* Success header — the sun's out */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sun/25 shadow-glow">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sun">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink-deep sm:text-4xl">
            Your dispute letter is ready.
          </h1>
          <p className="mt-3 font-sans text-base text-slate">
            We&apos;ve emailed a copy too. Download it below — then take your first step.
          </p>
        </div>

        {/* Download card */}
        <div className="mb-8 rounded-2xl border border-rule bg-paper px-6 py-6 shadow-lift">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
            Your dispute letter
          </p>
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-blue px-6 py-4 font-sans text-base font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download my dispute letter (PDF)
          </a>
          <p className="mt-3 text-center font-mono text-[10px] tracking-wide text-slate-faint">
            Link expires in 1 hour · also sent to your email
          </p>
        </div>

        {/* What to do next */}
        <div className="mb-8">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
            Your first moves
          </p>
          <div className="flex flex-col gap-4">
            {NEXT_STEPS.map((s) => (
              <div key={s.step} className="rounded-2xl border border-rule bg-paper px-5 py-4 shadow-lift">
                <div className="flex items-start gap-4">
                  <span className="flex-shrink-0 pt-0.5 font-mono text-xs font-semibold text-blue/70">{s.step}</span>
                  <div>
                    <p className="font-display text-base font-semibold text-ink-deep">{s.title}</p>
                    <p className="mt-1 font-sans text-sm leading-relaxed text-slate">{s.body}</p>
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
            className="font-sans text-sm text-slate-muted underline underline-offset-2 transition-colors hover:text-ink"
          >
            Have another rejected claim? Check it too →
          </Link>
        </div>

        <p className="mt-10 text-center font-sans text-xs leading-relaxed text-slate-faint">
          Every citation is verified against official IRDAI circulars and ombudsman rulings. Ashray is an
          informational tool and not legal advice.
        </p>
      </div>
    </main>
  )
}
