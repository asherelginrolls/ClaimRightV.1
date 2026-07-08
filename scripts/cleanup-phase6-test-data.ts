// One-off cleanup of the Phase-6 verification leftovers in the live DB:
//   - case ad556e34-… (found by prefix) + its documents, stages, artifacts,
//     and storage files
//   - auth user phase6-vault@ashray.test
// Also removes any stale smoke-test cases (email like smoke-%@ashray.test).
//
// Usage: npx tsx --env-file=.env.local scripts/cleanup-phase6-test-data.ts

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PHASE6_CASE_PREFIX = 'ad556e34'
const PHASE6_EMAIL = 'phase6-vault@ashray.test'

async function removeStorageFolder(prefix: string): Promise<void> {
  // Storage has no recursive delete; walk one level of known subpaths.
  const paths: string[] = []
  const { data: top } = await supabase.storage.from('documents').list(prefix)
  for (const item of top ?? []) {
    if (item.id === null) {
      // folder (e.g. stages/)
      const { data: sub } = await supabase.storage.from('documents').list(`${prefix}/${item.name}`)
      for (const subItem of sub ?? []) {
        if (subItem.id === null) {
          const { data: leaf } = await supabase.storage
            .from('documents')
            .list(`${prefix}/${item.name}/${subItem.name}`)
          for (const l of leaf ?? []) paths.push(`${prefix}/${item.name}/${subItem.name}/${l.name}`)
        } else {
          paths.push(`${prefix}/${item.name}/${subItem.name}`)
        }
      }
    } else {
      paths.push(`${prefix}/${item.name}`)
    }
  }
  if (paths.length > 0) {
    await supabase.storage.from('documents').remove(paths)
    console.log(`  storage: removed ${paths.length} object(s) under ${prefix}/`)
  }
}

async function deleteCase(caseId: string): Promise<void> {
  const { data: stageRows } = await supabase.from('dispute_stages').select('id').eq('case_id', caseId)
  const stageIds = ((stageRows ?? []) as Array<{ id: string }>).map((s) => s.id)
  if (stageIds.length > 0) {
    await supabase.from('stage_artifacts').delete().in('stage_id', stageIds)
    await supabase.from('dispute_stages').delete().eq('case_id', caseId)
  }
  await supabase.from('case_documents').delete().eq('case_id', caseId)
  await supabase.from('cases').delete().eq('id', caseId)
  await removeStorageFolder(caseId)
  console.log(`  deleted case ${caseId} (stages: ${stageIds.length})`)
}

async function main(): Promise<void> {
  // 1. Phase-6 case by prefix
  const { data: cases } = await supabase
    .from('cases')
    .select('id, email')
    .like('id', `${PHASE6_CASE_PREFIX}%`)
  for (const c of (cases ?? []) as Array<{ id: string; email: string | null }>) {
    console.log(`Phase-6 case ${c.id} (${c.email ?? 'no email'}):`)
    await deleteCase(c.id)
  }
  if (!cases || cases.length === 0) console.log(`No case with prefix ${PHASE6_CASE_PREFIX} found.`)

  // 2. Stale smoke cases
  const { data: smokeCases } = await supabase
    .from('cases')
    .select('id, email')
    .like('email', 'smoke-%@ashray.test')
  for (const c of (smokeCases ?? []) as Array<{ id: string; email: string | null }>) {
    console.log(`Stale smoke case ${c.id} (${c.email}):`)
    await deleteCase(c.id)
  }

  // 3. Phase-6 auth user
  const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const phase6User = userList?.users.find((u) => u.email === PHASE6_EMAIL)
  if (phase6User) {
    await supabase.auth.admin.deleteUser(phase6User.id)
    console.log(`Deleted auth user ${PHASE6_EMAIL} (${phase6User.id})`)
  } else {
    console.log(`Auth user ${PHASE6_EMAIL} not found (already removed?).`)
  }

  console.log('\nCleanup complete.')
}

main().catch((err) => {
  console.error('Cleanup failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
