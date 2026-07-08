'use client'

// Email-OTP sign-in (Supabase Auth). Shared by /auth and the inline step on
// the pay page. Two steps: send a 6-digit code, then verify it.

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'

interface OtpSignInProps {
  /** Called once the user is signed in (session cookie is set). */
  onSignedIn: () => void
  /** Prefill for the email field (e.g. the case email on the pay page). */
  initialEmail?: string
  /** Compact styling for inline embedding (pay page). */
  compact?: boolean
}

// Supabase's default per-email resend window is 60s; mirroring it client-side
// means users see a countdown instead of a raw rate-limit error.
const RESEND_COOLDOWN_S = 60

export function OtpSignIn({ onSignedIn, initialEmail = '', compact = false }: OtpSignInProps) {
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  const supabase = createBrowserClient()

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  function sendErrorMessage(message: string): string {
    const msg = message.toLowerCase()
    if (msg.includes('rate') || msg.includes('too many')) {
      return 'We recently sent a code to this email — check your inbox and spam folder. You can request another one in about a minute.'
    }
    return "We couldn't send the code. Please check the email address and try again."
  }

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
      setError(sendErrorMessage(err.message))
      // A rate-limited send means a code is already on its way (or recently
      // was) — let the user proceed to the code step instead of stranding them.
      if (err.message.toLowerCase().includes('rate')) {
        setCooldown(RESEND_COOLDOWN_S)
        setStep('code')
      }
      return
    }
    setCooldown(RESEND_COOLDOWN_S)
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
      const msg = err.message.toLowerCase()
      setError(
        msg.includes('expired')
          ? 'That code has expired. Request a fresh one below — it arrives within a minute.'
          : 'That code didn’t match. Check the latest email (older codes stop working when a new one is sent).'
      )
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
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setCode('')
                void sendCode()
              }}
              disabled={busy || cooldown > 0}
              className="font-sans text-xs text-slate-muted underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
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
          <p className="font-sans text-xs leading-relaxed text-slate-faint">
            Codes can take a minute to arrive — check spam if you don&apos;t see it.
          </p>
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
