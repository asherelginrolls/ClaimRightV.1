'use client'

// Auth-aware header link: signed-out users see "Sign in", signed-in users see
// "My cases". Keeps the access model honest — the vault is an account surface,
// so the header never implies a signed-out user has a case list.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase-browser'

export function HeaderNav() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(session !== null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(session !== null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Stable width while the session loads, so the header doesn't jump.
  if (signedIn === null) {
    return <span className="inline-block w-16" aria-hidden />
  }

  return signedIn ? (
    <Link
      href="/vault"
      className="font-sans text-sm font-medium text-slate transition-colors hover:text-ink"
    >
      My cases
    </Link>
  ) : (
    <Link
      href="/auth"
      className="font-sans text-sm font-medium text-slate transition-colors hover:text-ink"
    >
      Sign in
    </Link>
  )
}
