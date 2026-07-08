'use client'

// Early lead capture: shown right under the analysis result, before the
// paywall. Signed-out users get the compact OTP flow; once signed in the case
// is bound to their account via the existing claim endpoint. Dismissible —
// the free analysis stays frictionless.

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import { OtpSignIn } from '@/app/components/OtpSignIn'

type SaveState = 'hidden' | 'offer' | 'signin' | 'saved'

export function SaveCaseCard({ caseId }: { caseId: string }) {
  const [state, setState] = useState<SaveState>('hidden')
  const [email, setEmail] = useState('')

  async function claimCase(onFail: SaveState) {
    try {
      const res = await fetch(`/api/cases/${caseId}/claim`, { method: 'POST' })
      setState(res.ok ? 'saved' : onFail)
    } catch {
      setState(onFail)
    }
  }

  useEffect(() => {
    if (!caseId) return
    if (sessionStorage.getItem(`save-card-dismissed-${caseId}`)) return

    const supabase = createBrowserClient()
    let cancelled = false

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled) return
      if (user) {
        // Already signed in — bind the case silently and confirm. If it can't
        // be claimed (e.g. owned by another account), stay out of the way.
        await claimCase('hidden')
        return
      }
      setState('offer')
      // Prefill the email entered at upload.
      fetch(`/api/case/${caseId}/email`)
        .then((r) => r.json())
        .then((d: { email?: string | null }) => {
          if (!cancelled && d.email) setEmail(d.email)
        })
        .catch(() => {})
    }
    void init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  if (state === 'hidden') return null

  if (state === 'saved') {
    return (
      <div className="mt-4 rounded-2xl border border-hope/25 bg-hope-soft/10 px-6 py-4 text-center">
        <p className="font-sans text-sm font-medium text-ink">
          <span className="mr-1.5 text-hope" aria-hidden>✓</span>
          This case is saved to your vault — every letter and deadline stays with your account.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-2xl border border-blue/20 bg-paper px-6 py-5 shadow-lift">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-base font-semibold text-ink-deep">
            Keep this case safe
          </p>
          <p className="mt-1 font-sans text-sm leading-relaxed text-slate">
            Right now this analysis lives only in this browser, for 24 hours. Sign in with your
            email and it stays in your vault — with every letter and deadline — at every stage of
            the dispute.
          </p>
        </div>
        <button
          onClick={() => {
            sessionStorage.setItem(`save-card-dismissed-${caseId}`, '1')
            setState('hidden')
          }}
          aria-label="Dismiss"
          className="rounded-full p-1 font-sans text-lg leading-none text-slate-faint transition-colors hover:text-ink"
        >
          ×
        </button>
      </div>

      {state === 'offer' ? (
        <button
          onClick={() => setState('signin')}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-blue/40 bg-sky-tint/60 px-5 py-2.5 font-sans text-sm font-semibold text-blue-deep transition-colors hover:border-blue"
        >
          Sign in to save this case
          <span aria-hidden>→</span>
        </button>
      ) : (
        <div className="mt-4">
          <OtpSignIn compact initialEmail={email} onSignedIn={() => void claimCase('offer')} />
        </div>
      )}
    </div>
  )
}
