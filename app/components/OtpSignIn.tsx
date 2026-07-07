'use client'

// Email-OTP sign-in (Supabase Auth). Shared by /auth and the inline step on
// the pay page. Two steps: send a 6-digit code, then verify it.

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'

interface OtpSignInProps {
  /** Called once the user is signed in (session cookie is set). */
  onSignedIn: () => void
  /** Prefill for the email field (e.g. the case email on the pay page). */
  initialEmail?: string
  /** Compact styling for inline embedding (pay page). */
  compact?: boolean
}

export function OtpSignIn({ onSignedIn, initialEmail = '', compact = false }: OtpSignInProps) {
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createBrowserClient()

  async function sendCode() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (err) {
      setError(
        err.message.toLowerCase().includes('rate')
          ? 'Too many code requests — please wait a minute and try again.'
          : "We couldn't send the code. Please check the email address and try again."
      )
      return
    }
    setStep('code')
  }

  async function verifyCode() {
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (err) {
      setError('That code didn’t match. Check the latest email and try again.')
      return
    }
    onSignedIn()
  }

  const inputCls =
    'w-full rounded-xl border border-rule-strong bg-white px-4 py-3 font-sans text-base text-ink placeholder:text-slate-faint focus:border-blue focus:outline-none'
  const buttonCls =
    'w-full rounded-full bg-blue px-6 py-3 font-sans text-base font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <div className={compact ? '' : 'rounded-2xl border border-rule bg-paper px-6 py-6 shadow-lift'}>
      {step === 'email' ? (
        <div className="flex flex-col gap-3">
          <label className="font-sans text-sm font-medium text-slate" htmlFor="otp-email">
            Your email
          </label>
          <input
            id="otp-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendCode()}
            placeholder="you@example.com"
            className={inputCls}
            autoComplete="email"
          />
          <button onClick={sendCode} disabled={busy} className={buttonCls}>
            {busy ? 'Sending…' : 'Email me a sign-in code'}
          </button>
          <p className="font-sans text-xs leading-relaxed text-slate-faint">
            No password needed — we email you a 6-digit code each time.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="font-sans text-sm font-medium text-slate" htmlFor="otp-code">
            Enter the 6-digit code we sent to <span className="font-semibold text-ink">{email}</span>
          </label>
          <input
            id="otp-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && verifyCode()}
            placeholder="123456"
            className={`${inputCls} text-center font-mono text-xl tracking-[0.4em]`}
            autoComplete="one-time-code"
          />
          <button onClick={verifyCode} disabled={busy} className={buttonCls}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button
            onClick={() => {
              setStep('email')
              setCode('')
              setError(null)
            }}
            className="font-sans text-xs text-slate-muted underline-offset-2 hover:underline"
          >
            Use a different email
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-coral bg-coral/10 px-4 py-3">
          <p className="font-sans text-sm text-coral-deep">{error}</p>
        </div>
      )}
    </div>
  )
}
