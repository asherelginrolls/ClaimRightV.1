// End-to-end funnel smoke test. Drives a RUNNING server (local `next dev` or a
// deployed URL) through the real API surface:
//
//   upload → analyse → [service-client 'paid' flip] → download poll → letter
//   → (--stages) advance GRO→Bima Bharosa and poll artifacts
//
// Razorpay checkout cannot be automated in test mode, so the paid transition is
// applied directly with the service key — everything else uses the public API
// with the cr_sid cookie exactly like a browser.
//
// Prints per-step wall-clock times so timeout regressions are visible.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/e2e-smoke.ts            # core funnel
//   npx tsx --env-file=.env.local scripts/e2e-smoke.ts --stages   # + dispute ladder
//   npx tsx --env-file=.env.local scripts/e2e-smoke.ts --keep     # skip cleanup
//   SMOKE_BASE_URL=https://… npx tsx --env-file=.env.local scripts/e2e-smoke.ts
//
// NOTE: runs real OCR + LLM calls (~₹20-45 of API spend per run with --stages).

import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const FIXTURE = join(process.cwd(), 'scripts', 'test-docs', 'test-rejection-letter.pdf.pdf')
const RUN_STAGES = process.argv.includes('--stages')
const KEEP = process.argv.includes('--keep')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local)')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let failures = 0
function assert(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    failures += 1
    console.error(`  ✗ FAIL: ${label}`)
  }
}

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  const result = await fn()
  console.log(`⏱  ${label}: ${fmt(Date.now() - t0)}`)
  return result
}

interface AnalyseBody {
  fightabilityNumeric?: number
  fightabilityScore?: string
  fightabilityReasons?: Array<{ reason: string; citation: string | null }>
  error?: string
}

interface DownloadBody {
  pending?: boolean
  signedUrl?: string
  status?: string
  error?: string
}

interface StageBody {
  stages?: Array<{
    id: string
    stage: string
    status: string
    generating: boolean
    artifacts: Array<{ id: string; type: string }>
  }>
  error?: string
}

async function main(): Promise<void> {
  console.log(`Smoke target: ${BASE_URL}\n`)
  const email = `smoke-${Date.now()}@ashray.test`

  // ── 1. Upload ──────────────────────────────────────────────────────────────
  const pdf = readFileSync(FIXTURE)
  const form = new FormData()
  form.append('email', email)
  form.append('files', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), 'rejection.pdf')
  form.append('doc_types', 'rejection_letter')

  const uploadRes = await timed('upload', () =>
    fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: form })
  )
  const uploadBody = (await uploadRes.json()) as { caseId?: string; error?: string }
  assert(uploadRes.ok && !!uploadBody.caseId, `upload returns caseId (${uploadBody.error ?? 'ok'})`)
  const caseId = uploadBody.caseId
  if (!caseId) return

  const setCookie = uploadRes.headers.get('set-cookie') ?? ''
  const sidMatch = /cr_sid=([^;]+)/.exec(setCookie)
  assert(!!sidMatch, 'upload sets cr_sid cookie')
  const cookie = `cr_sid=${sidMatch?.[1] ?? ''}`
  console.log(`  caseId=${caseId}`)

  // ── 2. Analyse ─────────────────────────────────────────────────────────────
  const analyseRes = await timed('analyse', () =>
    fetch(`${BASE_URL}/api/analyse?caseId=${caseId}`, { headers: { cookie } })
  )
  const analyse = (await analyseRes.json()) as AnalyseBody
  assert(analyseRes.ok && !analyse.error, `analyse succeeds (${analyse.error ?? 'ok'})`)
  assert(typeof analyse.fightabilityNumeric === 'number', 'analyse returns a numeric score')
  const reasons = analyse.fightabilityReasons ?? []
  assert(reasons.length >= 1, `analyse returns reasons (${reasons.length})`)
  assert(
    reasons.some((r) => r.citation !== null),
    'at least one reason carries a real citation'
  )
  console.log(`  score=${analyse.fightabilityNumeric} (${analyse.fightabilityScore})`)

  // Cached refresh must be instant (no AI re-run).
  const t0 = Date.now()
  const cachedRes = await fetch(`${BASE_URL}/api/analyse?caseId=${caseId}`, { headers: { cookie } })
  const cachedMs = Date.now() - t0
  assert(cachedRes.ok && cachedMs < 5_000, `analyse refresh is cached (${fmt(cachedMs)})`)

  // ── 3. Paid flip (Razorpay checkout can't be scripted in test mode) ────────
  const { error: payError } = await supabase
    .from('cases')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', caseId)
  assert(!payError, `service-client paid flip (${payError?.message ?? 'ok'})`)

  // ── 4. Download poll → letter ──────────────────────────────────────────────
  const letter = await timed('letter generation (download poll)', async () => {
    const deadline = Date.now() + 6 * 60_000
    for (;;) {
      const res = await fetch(`${BASE_URL}/api/download/${caseId}`, { headers: { cookie } })
      const body = (await res.json()) as DownloadBody
      if (!res.ok) throw new Error(`download ${res.status}: ${body.error}`)
      if (body.pending === false && body.signedUrl) return body
      if (Date.now() > deadline) throw new Error('letter not ready after 6 minutes')
      await new Promise((r) => setTimeout(r, 3000))
    }
  })
  assert(!!letter.signedUrl, 'download returns a signed letter URL')
  const pdfRes = await fetch(letter.signedUrl!)
  const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer())
  const pdfMagic = Array.from(pdfBytes.slice(0, 5))
    .map((b) => String.fromCharCode(b))
    .join('')
  assert(
    pdfRes.ok && pdfBytes.length > 10_000 && pdfMagic === '%PDF-',
    `letter is a real PDF (${(pdfBytes.length / 1024).toFixed(0)} KB)`
  )

  // ── 5. Stages: GRO recorded ────────────────────────────────────────────────
  const stagesRes = await fetch(`${BASE_URL}/api/cases/${caseId}/stages`, { headers: { cookie } })
  const stagesBody = (await stagesRes.json()) as StageBody
  const gro = stagesBody.stages?.find((s) => s.stage === 'gro')
  assert(!!gro, 'GRO stage exists after delivery')
  assert((gro?.artifacts.length ?? 0) >= 1, 'GRO stage has the letter artifact')

  // ── 6. (--stages) Advance to Bima Bharosa and poll artifacts ──────────────
  if (RUN_STAGES) {
    const advRes = await fetch(`${BASE_URL}/api/cases/${caseId}/stages/advance`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ toStage: 'bima_bharosa' }),
    })
    assert(advRes.ok, `advance to bima_bharosa (${advRes.status})`)

    const bb = await timed('bima_bharosa artifact generation', async () => {
      const deadline = Date.now() + 8 * 60_000
      for (;;) {
        const res = await fetch(`${BASE_URL}/api/cases/${caseId}/stages`, { headers: { cookie } })
        const body = (await res.json()) as StageBody
        const stage = body.stages?.find((s) => s.stage === 'bima_bharosa')
        if (stage && stage.artifacts.length >= 2) return stage
        if (Date.now() > deadline) throw new Error('BB artifacts not ready after 8 minutes')
        await new Promise((r) => setTimeout(r, 5000))
      }
    })
    assert(
      bb.artifacts.some((a) => a.type === 'complaint_form' || a.type === 'grievance_letter'),
      'BB complaint artifact generated'
    )
    assert(
      bb.artifacts.some((a) => a.type === 'filing_walkthrough'),
      'BB filing walkthrough generated'
    )
  }

  // ── 7. Cleanup ─────────────────────────────────────────────────────────────
  if (!KEEP) {
    const { data: stageRows } = await supabase
      .from('dispute_stages')
      .select('id')
      .eq('case_id', caseId)
    const stageIds = ((stageRows ?? []) as Array<{ id: string }>).map((s) => s.id)
    if (stageIds.length > 0) {
      await supabase.from('stage_artifacts').delete().in('stage_id', stageIds)
      await supabase.from('dispute_stages').delete().eq('case_id', caseId)
    }
    await supabase.from('case_documents').delete().eq('case_id', caseId)
    await supabase.from('cases').delete().eq('id', caseId)
    const { data: objects } = await supabase.storage.from('documents').list(caseId)
    if (objects && objects.length > 0) {
      await supabase.storage
        .from('documents')
        .remove(objects.map((o) => `${caseId}/${o.name}`))
    }
    console.log('\ncleanup: smoke case removed')
  } else {
    console.log(`\ncleanup skipped (--keep): caseId=${caseId}`)
  }
}

main()
  .then(() => {
    if (failures > 0) {
      console.error(`\nSMOKE FAILED: ${failures} assertion(s)`)
      process.exit(1)
    }
    console.log('\nSMOKE PASSED')
  })
  .catch((err) => {
    console.error('\nSMOKE ERROR:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
