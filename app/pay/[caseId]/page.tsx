'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PaymentOrderResponse, ApiError } from '@/types/api'

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
  'Full point-by-point regulation analysis specific to your rejection',
  'Formal GRO complaint letter citing your insurer\'s specific IRDAI violations',
  'Exact regulation clauses (IRDAI circular sections) that apply to your case',
  'Step-by-step escalation path: GRO → IGMS → Insurance Ombudsman',
  'Emailed to you as a PDF — download anytime',
]

export default function PayPage() {
  const params = useParams()
  const router = useRouter()
  const caseId = params.caseId as string

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)

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
    script.onerror = () => setError('Could not load payment module. Please refresh and try again.')
    document.body.appendChild(script)
  }, [])

  // Prefetch case email for Razorpay prefill
  useEffect(() => {
    if (!caseId) return
    fetch(`/api/analyse?caseId=${caseId}`)
      .then((r) => r.json())
      .then((d: { email?: string }) => { if (d.email) setEmail(d.email) })
      .catch(() => {})
  }, [caseId])

  const handlePayment = useCallback(async () => {
    if (!scriptLoaded) {
      setError('Payment module not loaded yet. Please wait a moment and try again.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Step 1: create Razorpay order
      const orderRes = await fetch('/api/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId }),
      })
      const orderData = (await orderRes.json()) as PaymentOrderResponse & ApiError

      if (!orderRes.ok || orderData.error) {
        setError(orderData.error ?? 'Could not initialise payment. Please try again.')
        setLoading(false)
        return
      }

      // Step 2: open Razorpay checkout
      const options: RazorpayOptions = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'ClaimRight',
        description: 'Full Analysis + Dispute Letter',
        order_id: orderData.orderId,
        prefill: { email },
        theme: { color: '#1F3B2A' },
        modal: {
          ondismiss: () => setLoading(false),
        },
        handler: async (response: RazorpayPaymentResponse) => {
          // Step 3: verify payment server-side
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
              setError(verifyData.error ?? 'Payment verification failed. Please contact support.')
              setLoading(false)
            }
          } catch {
            setError('Payment verification failed. Please contact support.')
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
    <main className="min-h-[calc(100vh-8rem)] bg-parchment py-14 px-6">
      <div className="mx-auto max-w-lg">
        {/* Back link */}
        <Link
          href={`/analysis/${caseId}`}
          className="inline-flex items-center gap-1 font-mono text-xs text-ink/50 hover:text-ink transition-colors mb-8"
        >
          ← Back to analysis
        </Link>

        {/* Header */}
        <div className="mb-8">
          <p className="font-mono text-[11px] tracking-widest text-ember uppercase mb-2">
            One-time · No subscription
          </p>
          <h1 className="font-serif text-3xl font-semibold text-ink">
            Full Analysis + Formal Dispute Letter
          </h1>
          <p className="mt-3 font-sans text-sm text-ink/60 leading-relaxed">
            Every citation traces to a real, verified IRDAI regulation or ombudsman
            precedent. No fabrication. Ever.
          </p>
        </div>

        {/* What you get */}
        <div className="rounded-xl border border-rule bg-cream px-6 py-5 mb-6">
          <p className="font-mono text-[10px] tracking-widest text-ink/40 uppercase mb-4">
            What&apos;s included
          </p>
          <ul className="flex flex-col gap-3">
            {WHAT_YOU_GET.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-forest/10 flex items-center justify-center">
                  <span className="block w-1.5 h-1.5 rounded-full bg-forest" />
                </span>
                <span className="font-sans text-sm text-ink/80 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Price + CTA */}
        <div className="rounded-xl border border-rule bg-cream px-6 py-6">
          <div className="flex items-baseline justify-between mb-5">
            <p className="font-sans text-sm font-medium text-ink/60">Total</p>
            <p className="font-serif text-4xl font-semibold text-forest">₹99</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="font-sans text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handlePayment}
            disabled={loading || !scriptLoaded}
            className="w-full rounded-xl bg-forest px-6 py-4 font-sans text-base font-semibold text-white shadow-md hover:bg-forest/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing…' : 'Pay ₹99 — Get Full Analysis + Dispute Letter'}
          </button>

          <p className="mt-4 text-center font-mono text-[10px] tracking-wide text-ink/40">
            UPI · Card · Net Banking · Secured by Razorpay
          </p>
        </div>

        {/* Disclaimer */}
        <p className="mt-8 text-center font-sans text-xs text-ink/30 leading-relaxed">
          All citations are verified against official IRDAI circulars and ombudsman awards.
          This is not legal advice and does not constitute legal representation.
        </p>
      </div>
    </main>
  )
}
