'use client'

// Auth-aware header link: signed-out users see "Sign in", signed-in users see
// "My cases". Keeps the access model honest — the vault is an account surface,
// so the header never implies a signed-out user has a case list.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase-browser'

export function HeaderNav() {
  // Default to the signed-out link: it server-renders (so the header works
  // before/without hydration) and most visitors are signed out. The session
  // check swaps it to "My cases" right after mount.
  const [signedIn, setSignedIn] = useState(false)

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
