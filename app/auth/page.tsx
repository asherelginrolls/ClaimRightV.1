'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { OtpSignIn } from '@/app/components/OtpSignIn'

function AuthInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/vault'

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
      <div className="mx-auto max-w-md">
        <div className="mb-8">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-blue">
            My cases
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink-deep sm:text-4xl">Sign in</h1>
          <p className="mt-3 font-sans text-base leading-relaxed text-slate">
            Access every case you’ve run — your documents, your letters, and where each dispute
            stands.
          </p>
        </div>
        <OtpSignIn
          onSignedIn={() => {
            router.push(next)
            router.refresh()
          }}
        />
      </div>
    </main>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthInner />
    </Suspense>
  )
}
