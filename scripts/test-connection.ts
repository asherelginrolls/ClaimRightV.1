import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function test() {
  const { error: casesError } = await supabase.from('cases').select('id').limit(1)
  if (casesError) console.error('cases table error:', casesError.message)
  else console.log('✅ cases table reachable')

  const { error: chunksError } = await supabase.from('kb_chunks').select('id').limit(1)
  if (chunksError) console.error('kb_chunks table error:', chunksError.message)
  else console.log('✅ kb_chunks table reachable')

  const { data: fn, error: fnError } = await supabase.rpc('match_kb_chunks', {
    query_embedding: new Array(1024).fill(0) as number[],
    query_text: 'test',
    match_threshold: 0.1,
    match_count: 1,
  })
  if (fnError && fnError.message.includes('does not exist')) {
    console.error('❌ match_kb_chunks function not found — run the SQL in Supabase dashboard')
  } else if (fnError) {
    console.error('match_kb_chunks error:', fnError.message)
  } else {
    console.log('✅ match_kb_chunks function reachable (returned', fn?.length ?? 0, 'results on empty DB)')
  }
}

test().catch(console.error)
