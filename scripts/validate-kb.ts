// Usage: npx tsx --env-file=.env.local scripts/validate-kb.ts

import { createClient } from '@supabase/supabase-js'
import { VoyageAIClient } from 'voyageai'

const TEST_QUERIES = [
  'insurer requested documents multiple times piecemeal',
  'pre-existing disease non-disclosure rejection after 5 years moratorium',
  'cashless authorization denied waiting period one hour',
  'claim settlement delay interest payment 30 days reimbursement',
  'reimbursement settlement deadline IRDAI health insurance regulation',
]

interface ChunkResult {
  id: string
  content: string
  source_title: string
  section_number: string | null
  similarity: number
}

async function validate() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! })

  // Check total chunk count
  const { count } = await supabase
    .from('kb_chunks')
    .select('*', { count: 'exact', head: true })

  console.log(`\nKB Status: ${count ?? 0} chunks in Supabase\n`)

  if (!count || count === 0) {
    console.error('⚠️  KB is empty — run the ingestion scripts first')
    process.exit(1)
  }

  console.log('Running 5 test queries (threshold: 0.30 for diagnostics)...\n')

  let passed = 0

  for (let qi = 0; qi < TEST_QUERIES.length; qi++) {
    const query = TEST_QUERIES[qi]
    // Respect Voyage AI free tier: 3 RPM = 1 request per 20s
    if (qi > 0) {
      console.log('  (waiting 22s for Voyage AI rate limit...)')
      await new Promise((r) => setTimeout(r, 22000))
    }
    console.log(`Query: "${query}"`)

    const result = await voyage.embed({ input: [query], model: 'voyage-law-2', inputType: 'query' })
    const embedding = result.data?.[0]?.embedding ?? []

    const { data, error } = await supabase.rpc('match_kb_chunks', {
      query_embedding: embedding,
      query_text: query,
      match_threshold: 0.30,
      match_count: 10,
    })

    if (error) {
      console.log(`  ✗ RPC error: ${error.message}\n`)
      continue
    }

    const results = (data as ChunkResult[]) ?? []
    const topScore = results[0]?.similarity ?? 0

    if (topScore > 0.40) passed++

    console.log(`  Top score: ${topScore.toFixed(3)} ${topScore > 0.40 ? '✓' : '⚠️'}`)
    console.log(`  Chunks returned: ${results.length}`)

    if (results[0]) {
      console.log(`  Best match: ${results[0].source_title}`)
      console.log(`  Section: ${results[0].section_number ?? 'n/a'}`)
      console.log(`  Preview: ${results[0].content.slice(0, 120).replace(/\n/g, ' ')}...`)
    } else {
      console.log('  ⚠️  No chunks returned')
    }
    console.log()
  }

  console.log(`Result: ${passed}/5 queries scored > 0.40`)
  if (passed >= 3) {
    console.log('✓ KB validation passed — ready for Session 3\n')
  } else {
    console.log('⚠️  KB validation below threshold — check ingestion logs\n')
  }
}

validate().catch((err) => { console.error('Fatal:', err); process.exit(1) })
