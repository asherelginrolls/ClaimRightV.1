// Usage: npx tsx --env-file=.env.local scripts/scoring-report.ts
//
// BOTTOMS-UP scoring calibration report (CLAUDE.md: "Dr. Gopinath demands
// bottoms-up numbers, not top-down estimates"). Reads every case that has a
// KNOWN outcome label (migration 008) and prints, per predicted band, how many
// cases there were and the ACTUAL win rate observed.
//
// This is the artifact that tells us WHEN we have enough labeled data to justify
// replacing RuleBasedScorer with a learned model. Until each band has a
// meaningful sample AND the bands are monotonically calibrated
// (strong > medium > low), the rules engine stays in charge — we do NOT train
// a model on thin or non-discriminating data.
//
// Requires migration 008_scoring_features_and_outcomes.sql to be applied.

import { createClient } from '@supabase/supabase-js'

type Band = 'strong' | 'medium' | 'low'
type Outcome = 'won' | 'partial' | 'lost' | 'withdrawn' | 'unknown'

interface CaseOutcomeRow {
  predicted_score: Band | null
  predicted_numeric: number | null
  outcome: Outcome
  outcome_stage: string | null
}

interface BandStats {
  n: number
  won: number
  partial: number
  lost: number
  withdrawn: number
  numericSum: number
  numericCount: number
}

// A band needs at least this many DECIDED cases (won+partial+lost) before its
// win rate is treated as signal rather than noise.
const MIN_DECIDED_PER_BAND = 30

const BAND_ORDER: Band[] = ['strong', 'medium', 'low']

function emptyStats(): BandStats {
  return { n: 0, won: 0, partial: 0, lost: 0, withdrawn: 0, numericSum: 0, numericCount: 0 }
}

function decided(s: BandStats): number {
  return s.won + s.partial + s.lost
}

// Win rate crediting a partial recovery as half a win. Returns null when there
// are no decided cases (avoid dividing by zero / reporting a fake 0%).
function winRate(s: BandStats): number | null {
  const d = decided(s)
  if (d === 0) return null
  return (s.won + 0.5 * s.partial) / d
}

function pct(v: number | null): string {
  return v === null ? '   n/a' : `${(v * 100).toFixed(1)}%`.padStart(6)
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase
    .from('cases')
    .select('predicted_score, predicted_numeric, outcome, outcome_stage')
    .neq('outcome', 'unknown')

  if (error) {
    console.error('Query failed:', error.message)
    if (/column .* does not exist/i.test(error.message)) {
      console.error('→ Apply supabase/migrations/008_scoring_features_and_outcomes.sql first.')
    }
    process.exit(1)
  }

  const rows = (data as CaseOutcomeRow[] | null) ?? []

  if (rows.length === 0) {
    console.log('\nNo labeled cases yet (every case has outcome = "unknown").')
    console.log('Record real outcomes via POST /api/admin/outcome as disputes resolve.')
    console.log('RuleBasedScorer (rules-v1) remains in charge — no model is justified.\n')
    return
  }

  const stats: Record<Band, BandStats> = {
    strong: emptyStats(),
    medium: emptyStats(),
    low: emptyStats(),
  }
  let unbanded = 0

  for (const r of rows) {
    const band = r.predicted_score
    if (band !== 'strong' && band !== 'medium' && band !== 'low') {
      unbanded += 1
      continue
    }
    const s = stats[band]
    s.n += 1
    if (r.outcome === 'won') s.won += 1
    else if (r.outcome === 'partial') s.partial += 1
    else if (r.outcome === 'lost') s.lost += 1
    else if (r.outcome === 'withdrawn') s.withdrawn += 1
    if (typeof r.predicted_numeric === 'number') {
      s.numericSum += r.predicted_numeric
      s.numericCount += 1
    }
  }

  // ── Calibration table ──────────────────────────────────────────────────────
  console.log(`\nScoring calibration — ${rows.length} labeled case(s), scorer: rules-v1\n`)
  console.log('┌────────┬──────┬─────┬─────────┬──────┬───────────┬─────────┬─────────┬──────────┐')
  console.log('│ Band   │  n   │ won │ partial │ lost │ withdrawn │ decided │ avg num │ win rate │')
  console.log('├────────┼──────┼─────┼─────────┼──────┼───────────┼─────────┼─────────┼──────────┤')
  for (const band of BAND_ORDER) {
    const s = stats[band]
    const avgNum = s.numericCount > 0 ? (s.numericSum / s.numericCount).toFixed(0) : ' n/a'
    console.log(
      `│ ${band.padEnd(6)} │ ${String(s.n).padStart(4)} │ ${String(s.won).padStart(3)} │ ` +
        `${String(s.partial).padStart(7)} │ ${String(s.lost).padStart(4)} │ ` +
        `${String(s.withdrawn).padStart(9)} │ ${String(decided(s)).padStart(7)} │ ` +
        `${String(avgNum).padStart(7)} │ ${pct(winRate(s)).padStart(8)} │`
    )
  }
  console.log('└────────┴──────┴─────┴─────────┴──────┴───────────┴─────────┴─────────┴──────────┘')
  if (unbanded > 0) {
    console.log(`(${unbanded} labeled case(s) had no predicted_score and were skipped.)`)
  }

  // ── Bottoms-up readiness verdict ───────────────────────────────────────────
  const allBandsEnough = BAND_ORDER.every((b) => decided(stats[b]) >= MIN_DECIDED_PER_BAND)
  const rates = BAND_ORDER.map((b) => winRate(stats[b]))
  const [strongR, mediumR, lowR] = rates
  const monotonic =
    strongR !== null &&
    mediumR !== null &&
    lowR !== null &&
    strongR >= mediumR &&
    mediumR >= lowR

  console.log('\nReadiness check (bottoms-up, not estimated):')
  console.log(
    `  • Every band has ≥ ${MIN_DECIDED_PER_BAND} decided cases: ${allBandsEnough ? 'YES' : 'NO'}`
  )
  console.log(
    `  • Bands are monotonically calibrated (strong ≥ medium ≥ low): ${
      monotonic ? 'YES' : strongR === null || mediumR === null || lowR === null ? 'INSUFFICIENT DATA' : 'NO'
    }`
  )

  if (allBandsEnough && monotonic) {
    console.log(
      '\n→ Sample size and calibration both look sufficient. A learned scorer is now' +
        '\n  worth EVALUATING against rules-v1 (it does not auto-replace it). Build a' +
        '\n  holdout from these labels and compare before swapping defaultScorer.\n'
    )
  } else {
    console.log(
      '\n→ Not enough labeled/calibrated data to justify a learned model.' +
        '\n  RuleBasedScorer (rules-v1) stays in charge. Keep recording outcomes.\n'
    )
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
