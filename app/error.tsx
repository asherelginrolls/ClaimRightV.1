'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/error]', error.message)
  }, [error])

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="rounded-2xl border border-rule bg-paper px-6 py-10 shadow-lift">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-sky-tint">
            <svg className="h-6 w-6 text-blue" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="font-display text-2xl font-semibold text-ink-deep">Something went wrong</p>
          <p className="mt-3 font-sans text-sm leading-relaxed text-slate">
            An unexpected error popped up. Your upload is safe — you can try again, or head back home.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={reset}
              className="w-full rounded-full bg-blue px-4 py-3 font-sans text-sm font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep"
            >
              Try again
            </button>
            <Link
              href="/"
              className="w-full rounded-full border border-rule-strong bg-paper px-4 py-3 text-center font-sans text-sm font-medium text-blue-deep transition-colors hover:border-blue/40"
            >
              Back to home
            </Link>
          </div>
          <p className="mt-6 font-mono text-[10px] text-slate-faint">
            Still stuck?{' '}
            <a href="mailto:support@ashray.in" className="underline underline-offset-2 hover:text-slate">
              support@ashray.in
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
