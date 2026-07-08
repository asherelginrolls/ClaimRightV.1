// Shared test/maintenance helper: recursively remove every object under a
// prefix in the `documents` bucket. Supabase Storage has no recursive delete
// and list() returns folders as entries with id === null, so we walk depth-
// first. Used by e2e-smoke.ts and cleanup-phase6-test-data.ts.

import type { SupabaseClient } from '@supabase/supabase-js'

async function collectPaths(
  supabase: SupabaseClient,
  prefix: string,
  out: string[],
  depth: number
): Promise<void> {
  if (depth > 6) return // safety bound; real layout is ≤3 levels deep
  const { data } = await supabase.storage.from('documents').list(prefix, { limit: 1000 })
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`
    if (item.id === null) {
      await collectPaths(supabase, path, out, depth + 1)
    } else {
      out.push(path)
    }
  }
}

/** Remove all objects under documents/{prefix}/ (any nesting). Returns count removed. */
export async function removeStorageFolder(
  supabase: SupabaseClient,
  prefix: string
): Promise<number> {
  const paths: string[] = []
  await collectPaths(supabase, prefix, paths, 0)
  if (paths.length > 0) {
    await supabase.storage.from('documents').remove(paths)
  }
  return paths.length
}
