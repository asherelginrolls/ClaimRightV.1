'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PaymentOrderResponse, ApiError } from '@/types/api'
import { createBrowserClient } from '@/lib/supabase-browser'
import { OtpSignIn } from '@/app/components/OtpSignIn'

interface RazorpayPaymentResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  handler: (response: RazorpayPaymentResponse) => void
  prefill: { email: string }
  theme: { color: string }
  modal: { ondismiss: () => void }
}

interface RazorpayInstance {
  open(): void
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance
  }
}

const WHAT_YOU_GET = [
  'A formal dispute letter, written in proper legal English and ready to send to your insurer',
  'The exact IRDAI rules your insurer broke — each one quoted with its official source',
  "A clear path in plain words: your insurer's grievance officer → the IRDAI portal → the ombudsman",
  'Everything emailed to you as a PDF you can download any time',
]

export default function PayPage() {
  const params = useParams()
  const router = useRouter()
  const caseId = params.caseId as string

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  // null = still checking; the pay button waits for a signed-in account so the
  // case lands in the user's vault (claimed via /api/cases/[caseId]/claim).
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  const claimCase = useCallback(async () => {
    try {
      await fetch(`/api/cases/${caseId}/claim`, { method: 'POST' })
    } catch {
      // Non-fatal: payment/verify auto-claims as a fallback.
    }
  }, [caseId])

  useEffect(() => {
    const supabase = createBrowserClient()
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setSignedIn(!!data.user)
        if (data.user) void claimCase()
      })
      .catch(() => setSignedIn(false))
  }, [claimCase])

  // Load Razorpay checkout script
  useEffect(() => {
    if (document.getElementById('razorpay-script')) {
      setScriptLoaded(true)
      return
    }
    const script = document.createElement('script')
    script.id = 'razorpay-script'
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => setScriptLoaded(true)
    script.onerror = () => setError("We couldn't load the payment window. Please refresh and try again.")
    document.body.appendChild(script)
  }, [])

  // Prefetch case email for Razorpay prefill
  useEffect(() => {
    if (!caseId) return
    fetch(`/api/case/${caseId}/email`)
      .then((r) => r.json())
      .then((d: { email?: string }) => { if (d.email) setEmail(d.email) })
      .catch(() => {})
  }, [caseId])

  const handlePayment = useCallback(async () => {
    if (!scriptLoaded) {
      setError('The payment window is still loading. Please wait a moment and try again.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const orderRes = await fetch('/api/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId }),
      })
      const orderData = (await orderRes.json()) as PaymentOrderResponse & ApiError

      if (!orderRes.ok || orderData.error) {
        setError(orderData.error ?? "We couldn't start the payment. Please try again.")
        setLoading(false)
        return
      }

      const options: RazorpayOptions = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Ashray',
        description: 'Full analysis + dispute letter',
        order_id: orderData.orderId,
        prefill: { email },
        theme: { color: '#2C7BC0' },
        modal: {
          ondismiss: () => setLoading(false),
        },
        handler: async (response: RazorpayPaymentResponse) => {
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response),
            })
            const verifyData = (await verifyRes.json()) as { success?: boolean; caseId?: string } & ApiError

            if (verifyData.success) {
              router.push(`/download/${caseId}`)
            } else {
              setError(verifyData.error ?? "We couldn't confirm your payment. Please contact us.")
              setLoading(false)
            }
          } catch {
            setError("We couldn't confirm your payment. Please contact us.")
            setLoading(false)
          }
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }, [caseId, email, router, scriptLoaded])

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
      <div className="mx-auto max-w-lg">
        <Link
          href={`/analysis/${caseId}`}
          className="mb-8 inline-flex items-center gap-1 font-mono text-xs text-slate-muted transition-colors hover:text-ink"
        >
          ← Back to my result
        </Link>

        <div className="mb-8">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-blue">
            One-time · No subscription
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink-deep sm:text-4xl">
            Your full analysis + dispute letter
          </h1>
          <p className="mt-3 font-sans text-base leading-relaxed text-slate">
            Everything you need to push back, in language that does the arguing for you. Every line is
            backed by a real IRDAI rule or ombudsman ruling — nothing invented.
          </p>
        </div>

        {/* What you get */}
        <div className="mb-6 rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
            What you get
          </p>
          <ul className="flex flex-col gap-3.5">
            {WHAT_YOU_GET.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-hope/10">
                  <svg className="h-3 w-3 text-hope" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="font-sans text-sm leading-relaxed text-ink/90">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Account step: the case must belong to an account so every letter
            and stage stays accessible in the vault. */}
        {signedIn === false && (
          <div className="mb-6 rounded-2xl border border-rule bg-paper px-6 py-5 shadow-lift">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-faint">
              One quick step
            </p>
            <p className="mb-4 font-sans text-sm leading-relaxed text-slate">
              Sign in with your email so this case — and every letter we generate for it — stays
              saved in your vault, at every stage of the dispute.
            </p>
            <OtpSignIn
              compact
              initialEmail={email}
              onSignedIn={() => {
                setSignedIn(true)
                void claimCase()
              }}
            />
          </div>
        )}

        {/* Price + CTA */}
        <div className="rounded-2xl border border-rule bg-paper px-6 py-6 shadow-lift">
          <div className="mb-5 flex items-baseline justify-between">
            <p className="font-sans text-sm font-medium text-slate">
              One-time — covers every stage of this case
            </p>
            <p className="font-display text-4xl font-semibold text-ink-deep">₹299</p>
          </div>
          <p className="-mt-3 mb-5 font-sans text-xs leading-relaxed text-slate-faint">
            Grievance officer letter today, and the Bima Bharosa and ombudsman documents when you
            need them — no extra charge.
          </p>

          {error && (
            <div className="mb-4 rounded-xl border border-coral bg-coral/10 px-4 py-3">
              <p className="font-sans text-sm text-coral-deep">{error}</p>
            </div>
          )}

          <button
            onClick={handlePayment}
            disabled={loading || !scriptLoaded || signedIn !== true}
            className="w-full rounded-full bg-blue px-6 py-4 font-sans text-base font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Processing…' : signedIn === false ? 'Sign in above to continue' : 'Pay ₹299 securely'}
          </button>

          <p className="mt-4 text-center font-mono text-[10px] tracking-wide text-slate-faint">
            UPI · Card · Net Banking · Secured by Razorpay
          </p>
        </div>

        <p className="mt-6 text-center font-sans text-sm leading-relaxed text-slate">
          If the letter isn&apos;t useful for your case, reply to your receipt within 7 days and we&apos;ll
          refund you in full.
        </p>

        <p className="mt-8 text-center font-sans text-xs leading-relaxed text-slate-faint">
          Every citation is verified against official IRDAI circulars and ombudsman rulings. Ashray is an
          informational tool and not legal advice.
        </p>
      </div>
    </main>
  )
}
