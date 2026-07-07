// Scored retrieval benchmark — recall@5 and MRR against fixed expected
// citations (CLAUDE.md §11). Run after every KB change; commit the output to
// docs/retrieval-baseline.md and never regress it.
//
// Usage: npx tsx --env-file=.env.local scripts/eval/retrieval-benchmark.ts [--write]
//   --write  → overwrite docs/retrieval-baseline.md with this run's results
//
// A query is a HIT at rank r if any chunk in the top 5 whose source_title
// contains one of the expected substrings appears at rank r.
//   recall@5 = fraction of queries with a hit in the top 5
//   MRR      = mean over queries of 1/rank of the first hit (0 if none)
//
// Requires a reachable Supabase with a populated kb_chunks + match_kb_chunks
// RPC, and a Voyage API key. Rate-limited to the Voyage free tier (3 RPM).

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { VoyageAIClient } from 'voyageai'
import { expandQueryWithSynonyms } from '../../lib/synonyms'

interface BenchQuery {
  id: string
  category: string
  query: string
  // Substring match (case-insensitive) against chunk source_title; a hit if ANY matches.
  expected_source_titles: string[]
  // Optional: also require this substring in the hit chunk's content (tightens
  // the match beyond just the right document).
  expected_content?: string
}

const QUERIES: BenchQuery[] = [
  {
    id: 'piecemeal',
    category: 'documentation_incomplete',
    query: 'insurer requested documents multiple times piecemeal prohibition IRDAI',
    expected_source_titles: ['Master Circular on Health Insurance'],
    expected_content: 'piecemeal',
  },
  {
    id: 'cashless-1hr',
    category: 'cashless_denial',
    query: 'cashless pre-authorization one hour discharge three hours denial IRDAI health insurance',
    expected_source_titles: ['Master Circular on Health Insurance'],
    expected_content: 'hour',
  },
  {
    id: 'settlement-30d-interest',
    category: 'documentation_incomplete',
    query: 'reimbursement claim settlement thirty days delay interest two percent per month',
    expected_source_titles: ['Master Circular on Health Insurance'],
  },
  {
    id: 'ped-moratorium',
    category: 'pre_existing_condition',
    query: 'pre-existing condition moratorium sixty months continuous coverage repudiation',
    expected_source_titles: ['Protection of Policyholders'],
    expected_content: 'moratorium',
  },
  {
    id: 'excl02-specified-disease',
    category: 'waiting_period',
    query: 'Excl.02 specified disease procedure waiting period 24 months list bursitis acute condition',
    // Phase 2 ingests the standardized-exclusions doc; until then this query
    // measures the known gap that lost the bursitis case.
    expected_source_titles: ['Standardised Exclusions', 'Standardized Exclusions', 'Excl'],
  },
  {
    id: 'excl-acute-unlisted',
    category: 'waiting_period',
    query: 'acute condition not listed specified disease exclusion misapplied waiting period',
    expected_source_titles: ['Standardised Exclusions', 'Standardized Exclusions', 'Excl'],
  },
  {
    id: 'non-disclosure-pmc-crc',
    category: 'non_disclosure',
    query: 'claim rejection requires committee review PMC CRC material non-disclosure',
    expected_source_titles: ['Protection of Policyholders'],
  },
  {
    id: 'ombudsman-penalty',
    category: 'ombudsman',
    query: 'ombudsman award penalty five thousand rupees per day non-compliance insurer',
    expected_source_titles: ['Ombudsman Rules'],
  },
  {
    id: 'ombudsman-no-lawyer',
    category: 'ombudsman',
    query: 'ombudsman complaint free no legal representative lawyer policyholder files himself',
    expected_source_titles: ['Ombudsman Rules'],
  },
  {
    id: 'consumer-deficiency',
    category: 'consumer_court',
    query: 'consumer court deficiency in service unfair trade practice insurance complaint',
    expected_source_titles: ['Consumer Protection Act'],
  },
  {
    id: 'gro-15-day',
    category: 'other',
    query: 'grievance redressal officer insurer written response fifteen days escalation',
    expected_source_titles: ['Master Circular', 'Protection of Policyholders'],
  },
  {
    id: 'free-look',
    category: 'other',
    query: 'free look period thirty days new policy cancellation refund',
    expected_source_titles: ['Protection of Policyholders'],
  },
]

const WAIT_MS = 22_000 // Voyage free tier: 3 RPM

interface ChunkResult {
  id: string
  content: string
  source_title: string
  section_number: string | null
  similarity: number
}

async function main() {
  const writeMode = process.argv.includes('--write')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! })

  const { count, error: countErr } = await supabase
    .from('kb_chunks')
    .select('*', { count: 'exact', head: true })
  if (countErr) {
    console.error(`✗ Cannot reach kb_chunks: ${countErr.message}`)
    console.error('  (Is the Supabase project live and migrated?)')
    process.exit(2)
  }
  console.log(`KB: ${count ?? 0} chunks. Running ${QUERIES.length} benchmark queries...\n`)

  const rows: Array<{ q: BenchQuery; rank: number | null; top: string }> = []

  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i]
    if (i > 0) await new Promise((r) => setTimeout(r, WAIT_MS))

    const expanded = expandQueryWithSynonyms(q.query)
    const emb = await voyage.embed({ input: [expanded], model: 'voyage-law-2', inputType: 'query' })
    const embedding = emb.data?.[0]?.embedding ?? []

    const { data, error } = await supabase.rpc('match_kb_chunks', {
      query_embedding: embedding,
      query_text: q.query,
      match_threshold: 0.2, // diagnostic floor — we score ranks, not the gate
      match_count: 5,
    })
    if (error) {
      console.log(`  [${q.id}] RPC error: ${error.message}`)
      rows.push({ q, rank: null, top: '(rpc error)' })
      continue
    }
    const chunks = (data as ChunkResult[]) ?? []
    let rank: number | null = null
    for (let r = 0; r < chunks.length; r++) {
      const c = chunks[r]
      const titleHit = q.expected_source_titles.some((t) =>
        c.source_title.toLowerCase().includes(t.toLowerCase())
      )
      const contentHit = !q.expected_content ||
        c.content.toLowerCase().includes(q.expected_content.toLowerCase())
      if (titleHit && contentHit) { rank = r + 1; break }
    }
    const top = chunks[0] ? `${chunks[0].source_title} @${chunks[0].similarity.toFixed(3)}` : '(none)'
    console.log(`  [${q.id}] ${rank ? `hit@${rank}` : 'MISS'} — top: ${top}`)
    rows.push({ q, rank, top })
  }

  const hits = rows.filter((r) => r.rank !== null)
  const recall5 = hits.length / rows.length
  const mrr = rows.reduce((acc, r) => acc + (r.rank ? 1 / r.rank : 0), 0) / rows.length

  console.log(`\nrecall@5 = ${(recall5 * 100).toFixed(1)}%  (${hits.length}/${rows.length})`)
  console.log(`MRR      = ${mrr.toFixed(3)}`)

  const lines = [
    '# Retrieval benchmark baseline',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/eval/retrieval-benchmark.ts\`.`,
    `KB size: ${count} chunks.`,
    '',
    `- **recall@5: ${(recall5 * 100).toFixed(1)}%** (${hits.length}/${rows.length} queries)`,
    `- **MRR: ${mrr.toFixed(3)}**`,
    '',
    '| query | category | rank | top result |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.q.id} | ${r.q.category} | ${r.rank ?? 'MISS'} | ${r.top} |`),
    '',
    'Re-run after every KB change. Neither number may regress.',
    '',
  ]
  if (writeMode) {
    const outPath = path.join(process.cwd(), 'docs', 'retrieval-baseline.md')
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
    console.log('\nWritten to docs/retrieval-baseline.md')
  } else {
    console.log('\n(dry run — pass --write to update docs/retrieval-baseline.md)')
  }
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1) })
