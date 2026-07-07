// Server-side auth helper. Ownership checks stay in API routes: read the
// authenticated user from the Supabase auth cookies (anon client), then do
// data access through the service client with an explicit user_id match.

import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'

/** The signed-in user for the current request, or null. Never throws. */
export async function getAuthenticatedUser(): Promise<User | null> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user ?? null
  } catch {
    return null
  }
}

/**
 * Case access rule shared by the stage/artifact routes:
 * an owned case is only its owner's; an unowned case is reachable by the
 * uploading browser session (cr_sid cookie = caseId).
 */
export function canAccessCase(
  caseRow: { id: string; user_id: string | null },
  userId: string | null,
  cookieSid: string | undefined
): boolean {
  if (caseRow.user_id !== null) return caseRow.user_id === userId
  return cookieSid === caseRow.id
}
