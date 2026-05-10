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
    <main className="min-h-[calc(100vh-8rem)] bg-parchment py-14 px-6">
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-10">
          <p className="font-serif text-2xl font-semibold text-red-800">
            Something went wrong
          </p>
          <p className="mt-3 font-sans text-sm text-red-700 leading-relaxed">
            An unexpected error occurred. Your upload is safe — you can try again
            or contact us if the problem persists.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={reset}
              className="w-full rounded-lg bg-red-700 px-4 py-3 font-sans text-sm font-semibold text-white hover:bg-red-800 transition-colors"
            >
              Try again
            </button>
            <Link
              href="/"
              className="w-full rounded-lg border border-red-300 bg-white px-4 py-3 font-sans text-sm font-medium text-red-800 hover:bg-red-50 transition-colors text-center"
            >
              Back to home
            </Link>
          </div>
          <p className="mt-6 font-mono text-[10px] text-red-500">
            Need help?{' '}
            <a
              href="mailto:support@claimright.in"
              className="underline underline-offset-2 hover:text-red-700"
            >
              support@claimright.in
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
