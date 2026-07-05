// Usage: npx tsx --env-file=.env.local scripts/purge-synthetic-precedents.ts
//
// One-off KB honesty repair (CLAUDE.md §1 trust guarantee).
// The "Insurance Ombudsman Award Precedents" chunks were synthesized —
// fake case numbers (IOB/MUM/2022/HI/00147 etc.) and awards dated 2022–2023
// citing circulars from 2024. They must never be retrievable.
//
// This is a data operation, not a schema migration, so the service client
// may run it directly. Idempotent — safe to re-run.

import { createClient } from '@supabase/supabase-js'

const SYNTHETIC_SOURCE_TITLE = 'Insurance Ombudsman Award Precedents'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: before, error: selErr } = await supabase
    .from('kb_chunks')
    .select('id, source_title, tier')
    .eq('source_title', SYNTHETIC_SOURCE_TITLE)

  if (selErr) throw new Error(`select failed: ${selErr.message}`)
  console.log(`Found ${before?.length ?? 0} synthetic precedent chunk(s).`)

  if (before && before.length > 0) {
    const { error: delErr } = await supabase
      .from('kb_chunks')
      .delete()
      .eq('source_title', SYNTHETIC_SOURCE_TITLE)
    if (delErr) throw new Error(`delete failed: ${delErr.message}`)
    console.log(`Deleted ${before.length} chunk(s).`)
  }

  const { count } = await supabase
    .from('kb_chunks')
    .select('*', { count: 'exact', head: true })
  console.log(`KB now has ${count ?? 0} chunks. Verifying zero synthetic remain...`)

  const { data: after } = await supabase
    .from('kb_chunks')
    .select('id')
    .eq('source_title', SYNTHETIC_SOURCE_TITLE)
  if ((after?.length ?? 0) > 0) {
    console.error('✗ Synthetic chunks still present!')
    process.exit(1)
  }
  console.log('✓ Zero synthetic precedent chunks in kb_chunks.')
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1) })
