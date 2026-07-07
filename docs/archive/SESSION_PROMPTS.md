# ClaimRight — Claude Code Session Prompts
**8 build sessions, one per prompt. Paste one at a time into a new Claude Code (Cowork) conversation.**
**Always read CLAUDE.md first. Each session builds on the previous one.**

---

## BEFORE YOU START ANY SESSION

1. You are Asher Elgin, non-technical founder of ClaimRight. You use Claude Code via the Claude desktop app.
2. Each session prompt below is self-contained. Paste the full prompt into a new Cowork conversation.
3. The folder you're working in is `claimright-code/` inside your ClaimRight folder.
4. Each session will tell you which API keys to set up. Do not skip this — the code will not run without them.
5. After each session, verify the result by following the VERIFICATION section before moving on.

---

---

# SESSION 1 — Project Scaffold + Supabase Schema

## BEFORE PASTING THIS INTO CLAUDE CODE, DO THIS FIRST:
1. Go to **supabase.com** → sign up → create a new project named "claimright"
2. Once created, go to Project Settings → API. Copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon/public key** (long JWT string)
   - **service_role key** (longer JWT string — keep this secret)
3. Create a file at `claimright-code/.env.local` with the following content (fill in your real values):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
VOYAGE_API_KEY=
ANTHROPIC_API_KEY=
SARVAM_API_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RESEND_API_KEY=
NEXT_PUBLIC_RAZORPAY_KEY_ID=
```
4. You only need the Supabase keys filled in for this session. Leave the others blank for now.

---

## PROMPT (paste everything below this line into Claude Code):

Read the CLAUDE.md file in this folder completely before doing anything else. It is the source of truth for this entire build.

You are building ClaimRight — an AI-powered health insurance dispute co-pilot for India. This is Session 1 of 8. There is no existing code. You are starting from zero.

### YOUR JOB IN THIS SESSION

Build the complete project scaffold and Supabase database schema. By the end of this session:
- A working Next.js 14 project exists with the correct folder structure
- All dependencies are installed
- Supabase tables, indexes, PostgreSQL functions, and RLS are fully set up
- The Supabase client is configured and tested
- TypeScript compiles clean with zero errors

### STEP 1: Create Next.js 14 project

Run the following to scaffold the project (say yes to all defaults, choose App Router, TypeScript, Tailwind, ESLint):
```bash
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*"
```

### STEP 2: Install all dependencies

```bash
npm install @supabase/supabase-js @supabase/ssr voyageai @anthropic-ai/sdk zod pdf-lib resend
npm install -D @types/node tsx
```

### STEP 3: Create the folder structure

Create empty placeholder files (with a single comment `// TODO`) in each of these paths to establish the structure:
- `app/page.tsx` (landing page)
- `app/upload/page.tsx`
- `app/analysis/[caseId]/page.tsx`
- `app/pay/[caseId]/page.tsx`
- `app/download/[caseId]/page.tsx`
- `app/api/upload/route.ts`
- `app/api/analyse/route.ts`
- `app/api/generate/route.ts`
- `app/api/payment/route.ts`
- `app/api/payment/verify/route.ts`
- `app/api/kb/ingest/route.ts`
- `lib/supabase.ts`
- `lib/voyage.ts`
- `lib/claude.ts`
- `lib/sarvam.ts`
- `lib/ocr.ts`
- `lib/retrieval.ts`
- `lib/scoring.ts`
- `lib/generation.ts`
- `lib/pdf.ts`
- `types/case.ts`
- `types/kb.ts`
- `types/api.ts`
- `prompts/extraction.ts`
- `prompts/scoring.ts`
- `prompts/generation.ts`
- `scripts/ingest-irdai.ts`
- `scripts/ingest-awards.ts`
- `scripts/validate-kb.ts`

### STEP 4: Create `.env.example`

Create `.env.example` with all keys listed but empty values (no real secrets):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VOYAGE_API_KEY=
ANTHROPIC_API_KEY=
SARVAM_API_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RESEND_API_KEY=
NEXT_PUBLIC_RAZORPAY_KEY_ID=
```

Add `.env.local` to `.gitignore` if not already there.

### STEP 5: Create the Supabase client (`lib/supabase.ts`)

Create a properly typed Supabase client with two exports:
1. `createClient()` — server-side client using `@supabase/ssr` with `cookies()` from `next/headers`
2. `createBrowserClient()` — client-side client using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `createServiceClient()` — admin client using `SUPABASE_SERVICE_ROLE_KEY` (server-side only, bypasses RLS)

Example pattern for server client:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) { ... },
        remove(name: string, options: CookieOptions) { ... },
      },
    }
  )
}
```

### STEP 6: Create the Supabase database schema

Connect to the Supabase project using the service role key and run the following SQL exactly. You can do this by creating a script `scripts/setup-db.ts` that uses the Supabase client with service role key to run raw SQL, or by outputting the SQL for me to run in the Supabase SQL editor. Output the complete SQL I need to run in the Supabase dashboard → SQL Editor:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Cases table
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT,
  status TEXT CHECK (status IN ('uploaded', 'analysed', 'paid', 'generated', 'delivered')) DEFAULT 'uploaded',
  insurer TEXT,
  claim_amount INTEGER,
  rejection_reason_raw TEXT,
  rejection_reason_category TEXT CHECK (rejection_reason_category IN (
    'pre_existing_condition', 'policy_exclusion', 'documentation_incomplete',
    'non_disclosure', 'waiting_period', 'cashless_denial',
    'experimental_treatment', 'fraud_suspected', 'other'
  )),
  rejection_date DATE,
  fightability_score TEXT CHECK (fightability_score IN ('low', 'medium', 'strong')),
  fightability_reasons JSONB,
  document_path TEXT,
  letter_path TEXT,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  paid_at TIMESTAMPTZ
);

-- KB chunks table
CREATE TABLE IF NOT EXISTS kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tier INTEGER CHECK (tier IN (1, 2, 3)),
  source_title TEXT NOT NULL,
  section_number TEXT,
  date DATE,
  circular_number TEXT,
  issuer TEXT NOT NULL,
  url TEXT,
  content TEXT NOT NULL,
  embedding VECTOR(1024),
  fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

-- HNSW index for vector search
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx
  ON kb_chunks USING hnsw (embedding vector_cosine_ops);

-- Full-text search index
CREATE INDEX IF NOT EXISTS kb_chunks_fts_idx
  ON kb_chunks USING GIN (fts);

-- Hybrid search function (CRITICAL: PostgREST cannot do vector ops directly — this function is how vector search works)
CREATE OR REPLACE FUNCTION match_kb_chunks(
  query_embedding VECTOR(1024),
  query_text TEXT,
  match_threshold FLOAT DEFAULT 0.65,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_title TEXT,
  section_number TEXT,
  circular_number TEXT,
  issuer TEXT,
  url TEXT,
  tier INTEGER,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    kc.id,
    kc.content,
    kc.source_title,
    kc.section_number,
    kc.circular_number,
    kc.issuer,
    kc.url,
    kc.tier,
    (0.7 * (1 - (kc.embedding <=> query_embedding))) +
    (0.3 * COALESCE(ts_rank(kc.fts, plainto_tsquery('english', query_text)), 0)) AS similarity
  FROM kb_chunks kc
  WHERE (1 - (kc.embedding <=> query_embedding)) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Enable RLS
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_chunks ENABLE ROW LEVEL SECURITY;

-- RLS policies for kb_chunks (public read, service-role write only)
CREATE POLICY "Anyone can read kb_chunks" ON kb_chunks FOR SELECT USING (true);

-- RLS policies for cases (anon insert/read by id, no updates without service role)
CREATE POLICY "Anyone can insert cases" ON cases FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read their own case" ON cases FOR SELECT USING (true);
CREATE POLICY "Service role can update cases" ON cases FOR UPDATE USING (true);

-- Supabase Storage bucket for documents
-- Run this separately if needed: INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
```

### STEP 7: Create TypeScript types (`types/case.ts`, `types/kb.ts`, `types/api.ts`)

**`types/case.ts`:**
```typescript
export type CaseStatus = 'uploaded' | 'analysed' | 'paid' | 'generated' | 'delivered'

export type RejectionCategory =
  | 'pre_existing_condition'
  | 'policy_exclusion'
  | 'documentation_incomplete'
  | 'non_disclosure'
  | 'waiting_period'
  | 'cashless_denial'
  | 'experimental_treatment'
  | 'fraud_suspected'
  | 'other'

export type FightabilityScore = 'low' | 'medium' | 'strong'

export interface FightabilityReason {
  reason: string
  citation: string | null
}

export interface Case {
  id: string
  created_at: string
  email: string | null
  status: CaseStatus
  insurer: string | null
  claim_amount: number | null // in paise
  rejection_reason_raw: string | null
  rejection_reason_category: RejectionCategory | null
  rejection_date: string | null
  fightability_score: FightabilityScore | null
  fightability_reasons: FightabilityReason[] | null
  document_path: string | null
  letter_path: string | null
  razorpay_order_id: string | null
  razorpay_payment_id: string | null
  paid_at: string | null
}
```

**`types/kb.ts`:**
```typescript
export type KbTier = 1 | 2 | 3

export interface KbChunk {
  id: string
  created_at: string
  tier: KbTier
  source_title: string
  section_number: string | null
  date: string | null
  circular_number: string | null
  issuer: string
  url: string | null
  content: string
  embedding: number[] | null
}

export interface KbSearchResult {
  id: string
  content: string
  source_title: string
  section_number: string | null
  circular_number: string | null
  issuer: string
  url: string | null
  tier: KbTier
  similarity: number
}
```

**`types/api.ts`:**
```typescript
export interface ApiError {
  error: string
  code?: string
}

export interface UploadResponse {
  caseId: string
  message: string
}

export interface AnalyseResponse {
  caseId: string
  insurer: string | null
  claimAmount: number | null
  rejectionReasonCategory: string | null
  fightabilityScore: 'low' | 'medium' | 'strong'
  fightabilityReasons: Array<{ reason: string; citation: string | null }>
}

export interface PaymentOrderResponse {
  orderId: string
  amount: number
  currency: string
  keyId: string
}

export interface GenerateResponse {
  caseId: string
  letterPath: string
  message: string
}
```

### STEP 8: Create `next.config.ts`

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
}

export default nextConfig
```

### STEP 9: Verify TypeScript compiles clean

Run:
```bash
npx tsc --noEmit
```
Fix any type errors before completing this session. Zero errors required.

### STEP 10: Create a quick connection test script

Create `scripts/test-connection.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function test() {
  // Test cases table exists
  const { data: cases, error: casesError } = await supabase.from('cases').select('id').limit(1)
  if (casesError) console.error('cases table error:', casesError.message)
  else console.log('✅ cases table reachable')

  // Test kb_chunks table exists
  const { data: chunks, error: chunksError } = await supabase.from('kb_chunks').select('id').limit(1)
  if (chunksError) console.error('kb_chunks table error:', chunksError.message)
  else console.log('✅ kb_chunks table reachable')

  // Test match_kb_chunks function exists (will fail on empty DB but should not throw "function does not exist")
  const { data: fn, error: fnError } = await supabase.rpc('match_kb_chunks', {
    query_embedding: new Array(1024).fill(0),
    query_text: 'test',
    match_threshold: 0.1,
    match_count: 1
  })
  if (fnError && fnError.message.includes('does not exist')) {
    console.error('❌ match_kb_chunks function not found — run the SQL in Supabase dashboard')
  } else {
    console.log('✅ match_kb_chunks function reachable (returned', fn?.length ?? 0, 'results on empty DB)')
  }
}

test()
```

Run it with: `npx tsx --env-file=.env.local scripts/test-connection.ts`

---

## VERIFICATION — DO THIS BEFORE MOVING TO SESSION 2

1. Run `npx tsc --noEmit` → output must say "0 errors" or nothing
2. Run `npm run dev` → app starts at http://localhost:3000 without crashing (even if pages are blank)
3. Run `npx tsx --env-file=.env.local scripts/test-connection.ts` → all 3 lines show ✅
4. Open Supabase dashboard → Table Editor → confirm `cases` and `kb_chunks` tables exist
5. Open Supabase dashboard → Database → Functions → confirm `match_kb_chunks` function exists
6. Check that `.env.local` is in `.gitignore` (critical — never commit secrets)

---

---

# SESSION 2 — KB Ingestion Pipeline

## BEFORE PASTING THIS INTO CLAUDE CODE, DO THIS FIRST:
1. Go to **voyageai.com** → sign up → create an API key
2. Add it to your `.env.local`: `VOYAGE_API_KEY=your-key-here`
3. Download these documents from the official sources and save them to `claimright-code/scripts/source-docs/`:
   - IRDAI Master Circular on Health Insurance (29.05.2024) → from irdai.gov.in (search "Master Circular Health Insurance 2024")
   - PPOI Master Circular (05.09.2024) → from irdai.gov.in (search "PPOI Master Circular 2024")
   - If you can't find them: the KB curator skill in your ClaimRight skills folder can help you locate and download these documents
4. Create the folder: `claimright-code/scripts/source-docs/`

---

## PROMPT (paste everything below this line into Claude Code):

Read the CLAUDE.md file in this folder completely before doing anything else.

This is Session 2. Session 1 is complete. The project scaffold, Supabase tables, and TypeScript types all exist. The kb_chunks table and match_kb_chunks function are live in Supabase.

### YOUR JOB IN THIS SESSION

Build the KB ingestion pipeline and the hybrid retrieval function. By the end:
- Scripts that chunk, embed, and store IRDAI documents in Supabase pgvector are working
- The Voyage AI client is set up in `lib/voyage.ts`
- The hybrid retrieval function in `lib/retrieval.ts` is working (vector + full-text, re-ranked)
- At least one IRDAI document has been ingested and test queries return real results

### STEP 1: Build the Voyage AI client (`lib/voyage.ts`)

```typescript
import VoyageAI from 'voyageai'
import { KbSearchResult } from '@/types/kb'

const voyage = new VoyageAI({ apiKey: process.env.VOYAGE_API_KEY! })

const EMBEDDING_MODEL = 'voyage-law-2'
const EMBEDDING_DIMENSION = 1024

export async function embedText(text: string, inputType: 'document' | 'query' = 'document'): Promise<number[]> {
  const result = await voyage.embed({
    input: [text],
    model: EMBEDDING_MODEL,
    inputType,
  })
  const embedding = result.embeddings?.[0]
  if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Voyage embed returned unexpected dimension: ${embedding?.length}`)
  }
  return embedding
}

export async function embedBatch(texts: string[], inputType: 'document' | 'query' = 'document'): Promise<number[][]> {
  // Voyage AI limit: 120K tokens per batch for voyage-law-2
  // Safe to send up to 50 texts at a time for our chunk sizes (~400 tokens each)
  const BATCH_SIZE = 50
  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const result = await voyage.embed({
      input: batch,
      model: EMBEDDING_MODEL,
      inputType,
    })
    allEmbeddings.push(...(result.embeddings ?? []))
    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < texts.length) await new Promise(r => setTimeout(r, 200))
  }

  return allEmbeddings
}
```

### STEP 2: Build the ingestion script (`scripts/ingest-irdai.ts`)

This script:
1. Takes a PDF file path as a command-line argument
2. Extracts text from it (use `pdf-lib` for text extraction, or if that fails, read the file as text if it's already text-based)
3. Splits into chunks of approximately 400 tokens with 50-token overlap (use word count as proxy: 400 tokens ≈ 300 words; overlap = 37 words)
4. For each chunk, requires complete metadata from the user OR from a JSON metadata file alongside the PDF
5. Embeds each chunk using voyage-law-2
6. Upserts into Supabase `kb_chunks` table using service role key

```typescript
// Usage: npx tsx --env-file=.env.local scripts/ingest-irdai.ts <pdf-path> <metadata-json-path>
// Metadata JSON format:
// {
//   "tier": 1,
//   "source_title": "IRDAI Master Circular on Health Insurance",
//   "circular_number": "IRDAI/HLT/REG/CIR/087/05/2024",
//   "issuer": "IRDAI",
//   "date": "2024-05-29",
//   "url": "https://irdai.gov.in/..."
// }
```

Important implementation details:
- Use `fs.readFileSync` to read the PDF as a buffer
- For text extraction from PDF, install and use `pdf-parse` package: `npm install pdf-parse @types/pdf-parse`
- The chunker must produce chunks with their `section_number` inferred from nearby heading text in the document (look for patterns like "Chapter X", "Section X.X", "Clause X.X" within 200 characters before the chunk start)
- After ingestion, log: total chunks created, total tokens estimated, any chunks skipped due to missing metadata

### STEP 3: Create the metadata files for IRDAI documents

Create `scripts/source-docs/irdai-health-master-2024.json`:
```json
{
  "tier": 1,
  "source_title": "IRDAI Master Circular on Health Insurance",
  "circular_number": "IRDAI/HLT/REG/CIR/087/05/2024",
  "issuer": "IRDAI",
  "date": "2024-05-29",
  "url": "https://irdai.gov.in/document-detail?documentId=5670268"
}
```

Create `scripts/source-docs/ppoi-master-2024.json`:
```json
{
  "tier": 1,
  "source_title": "IRDAI Master Circular on Protection of Policyholders' Interests",
  "circular_number": "IRDAI/LIFE/CIR/MISC/211/09/2024",
  "issuer": "IRDAI",
  "date": "2024-09-05",
  "url": "https://irdai.gov.in/document-detail?documentId=6259853"
}
```

### STEP 4: Build the hybrid retrieval function (`lib/retrieval.ts`)

This is the heart of the RAG pipeline. Implement it exactly:

```typescript
import { createServiceClient } from '@/lib/supabase'
import { embedText } from '@/lib/voyage'
import { KbSearchResult } from '@/types/kb'

export interface RetrievalResult {
  chunks: KbSearchResult[]
  queryEmbedding: number[]
  topScore: number
}

export async function retrieveChunks(
  query: string,
  options: {
    matchThreshold?: number  // default 0.65
    matchCount?: number      // default 10 (top 10 → re-rank → return top 3)
    tierFilter?: 1 | 2 | 3  // optional: only retrieve from a specific tier
  } = {}
): Promise<RetrievalResult> {
  const {
    matchThreshold = 0.65,
    matchCount = 10,
  } = options

  // Step 1: Embed the query using voyage-law-2 with input_type='query'
  const queryEmbedding = await embedText(query, 'query')

  // Step 2: Call match_kb_chunks via rpc() — the only way to do vector search in Supabase
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('match_kb_chunks', {
    query_embedding: queryEmbedding,
    query_text: query,
    match_threshold: matchThreshold,
    match_count: matchCount,
  })

  if (error) throw new Error(`KB retrieval failed: ${error.message}`)

  const results = (data as KbSearchResult[]) ?? []

  // Step 3: Re-rank top 10 → return top 3
  // Re-ranking: boost Tier 1 chunks by 0.05 (regulatory > precedent)
  const reranked = results
    .map(r => ({ ...r, rerankedScore: r.similarity + (r.tier === 1 ? 0.05 : 0) }))
    .sort((a, b) => b.rerankedScore - a.rerankedScore)
    .slice(0, 3)

  const topScore = reranked[0]?.similarity ?? 0

  return {
    chunks: reranked,
    queryEmbedding,
    topScore,
  }
}

export async function retrieveForCase(extractedFacts: {
  insurerName: string | null
  rejectionReasonRaw: string | null
  rejectionReasonCategory: string | null
  claimAmount: number | null
}): Promise<RetrievalResult> {
  // Build a rich query from all available case facts
  const queryParts = [
    extractedFacts.rejectionReasonRaw,
    extractedFacts.insurerName ? `insurer: ${extractedFacts.insurerName}` : null,
    extractedFacts.rejectionReasonCategory ? `rejection category: ${extractedFacts.rejectionReasonCategory.replace(/_/g, ' ')}` : null,
    'IRDAI regulation health insurance India',
  ].filter(Boolean)

  const query = queryParts.join('. ')
  return retrieveChunks(query)
}
```

### STEP 5: Create a validation script (`scripts/validate-kb.ts`)

```typescript
// Usage: npx tsx --env-file=.env.local scripts/validate-kb.ts
// Tests the KB with 5 standard rejection letter queries and confirms relevant chunks are returned

import { retrieveChunks } from '@/lib/retrieval'

const TEST_QUERIES = [
  'insurer requested documents multiple times piecemeal',
  'pre-existing disease non-disclosure rejection after 5 years',
  'cashless authorization denied waiting period',
  'claim rejected 30 days interest payment delay',
  'reimbursement settlement deadline IRDAI health insurance',
]

async function validate() {
  console.log('Running KB validation with 5 test queries...\n')

  for (const query of TEST_QUERIES) {
    console.log(`Query: "${query}"`)
    const result = await retrieveChunks(query, { matchThreshold: 0.3 }) // lower threshold for testing
    console.log(`  Top score: ${result.topScore.toFixed(3)}`)
    console.log(`  Chunks returned: ${result.chunks.length}`)
    if (result.chunks[0]) {
      console.log(`  Best match: ${result.chunks[0].source_title} §${result.chunks[0].section_number}`)
      console.log(`  Preview: ${result.chunks[0].content.slice(0, 120)}...`)
    } else {
      console.log(`  ⚠️  No chunks returned — KB may need more documents`)
    }
    console.log()
  }
}

validate().catch(console.error)
```

### STEP 6: Ingest at least one document

If the IRDAI Master Circular PDF exists in `scripts/source-docs/`, run:
```bash
npx tsx --env-file=.env.local scripts/ingest-irdai.ts scripts/source-docs/irdai-health-master-2024.pdf scripts/source-docs/irdai-health-master-2024.json
```

If the PDF is not yet available, create a minimal seed document `scripts/source-docs/irdai-seed.txt` with the following content (key IRDAI clauses from the Master Circular, verbatim) and write a companion `scripts/ingest-text.ts` script that ingests a `.txt` file instead of PDF:

```
IRDAI Master Circular on Health Insurance (29.05.2024)

Clause 4.2 — Cashless Authorization
The insurer shall convey the authorization decision to the hospital within one hour of receiving the pre-authorization request. In case of planned hospitalization, the insurer shall communicate authorization within one hour. In case of emergency hospitalization, the decision must be communicated immediately.

Clause 4.3 — Discharge Authorization
Upon completion of treatment, the insurer shall issue the final discharge authorization within three hours of receiving the final bill from the hospital. Delays in discharge authorization beyond three hours shall be treated as deemed authorization.

Clause 5.7 — Document Requests
The insurer shall not ask for documents in a piecemeal manner. All documents required for processing a claim shall be called for in a single request. Any subsequent request for documents already submitted or for documents not directly relevant to the claim shall be deemed invalid.

Clause 7.1 — Settlement Timeline
The insurer shall settle a reimbursement claim within 30 days of receiving all required documents. In case of delay beyond 30 days, the insurer shall pay interest at 2% per month from the date the documents were received to the date of settlement.

Clause 8.3 — Claim Rejection Process
No claim shall be rejected without a detailed written explanation citing the specific policy clause or IRDAI regulation that forms the basis of rejection. The rejection letter must mention the specific exclusion clause by number and provide a factual basis for its application to the policyholder's case.
```

```
IRDAI Master Circular on Protection of Policyholders' Interests (PPOI) (05.09.2024)

Section 5.3 — Moratorium Period for Pre-Existing Diseases
After the completion of sixty months (5 years) of continuous coverage under the health insurance policy, the insurer shall not reject any claim on the grounds of non-disclosure or misrepresentation of pre-existing disease at the time of proposal. This moratorium period applies across all individual and group health insurance policies.

Section 6.1 — Claims Review Committee
All rejections on grounds of pre-existing disease, non-disclosure, or fraud suspicion shall mandatorily be reviewed by the Policy Management Committee (PMC) or Claims Review Committee (CRC) before the rejection letter is issued. Rejections without such review are invalid.

Section 12.1 — Penalties for Non-Compliance
Non-compliance with ombudsman awards within 30 days of the award attracts a penalty of Rs. 5,000 per day of default, payable to the policyholder.
```

Create `scripts/source-docs/irdai-seed.json`:
```json
{
  "tier": 1,
  "source_title": "IRDAI Master Circulars (Seed — Health Insurance + PPOI 2024)",
  "circular_number": "IRDAI/HLT/REG/CIR/087/05/2024 + IRDAI/LIFE/CIR/MISC/211/09/2024",
  "issuer": "IRDAI",
  "date": "2024-09-05",
  "url": "https://irdai.gov.in"
}
```

---

## VERIFICATION — DO THIS BEFORE MOVING TO SESSION 3

1. Run `npx tsc --noEmit` → zero errors
2. Run `npx tsx --env-file=.env.local scripts/validate-kb.ts`
3. At least 3 of the 5 test queries should return chunks with top score > 0.40
4. Open Supabase dashboard → Table Editor → kb_chunks → confirm rows exist with non-null `embedding` column
5. At least one chunk should mention "piecemeal" in its content (confirms IRDAI Master Circular was ingested)

---

---

# SESSION 3 — Document Upload + OCR + Fact Extraction

## BEFORE PASTING THIS INTO CLAUDE CODE, DO THIS FIRST:
1. Go to **console.anthropic.com** → create an account → create a new API key (note: this is SEPARATE from your Claude subscription — it's the raw API)
2. Go to **sarvam.ai** → sign up → get an API key
3. Add both to `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   SARVAM_API_KEY=...
   ```
4. Find a sample rejection letter to test with. You can use the text from your mother's case at `../Mom's Case/RejectionLetterCIR_2026_181313_1224992.pdf` — save a copy to `claimright-code/scripts/test-docs/sample-rejection.md`

---

## PROMPT (paste everything below this line into Claude Code):

Read the CLAUDE.md file in this folder completely before doing anything else.

This is Session 3. Sessions 1 and 2 are complete. The project is scaffolded, Supabase schema is live, KB is ingested, and retrieval is working.

### YOUR JOB IN THIS SESSION

Build the document upload API, OCR pipeline, and fact extraction. By the end:
- A user can upload a PDF or image to `/api/upload` and get back a `caseId`
- The document is stored in Supabase Storage
- A new case row is created in the `cases` table
- OCR extracts text (Sarvam for non-ASCII-heavy docs, Claude Haiku Vision for English)
- Claude Haiku extracts structured facts and maps to the 9 canonical rejection categories
- All output is Zod-validated

### STEP 1: Set up Supabase Storage bucket

Add to `scripts/setup-db.ts` (or output SQL to run in Supabase dashboard):
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: service role can write, authenticated via case ownership
CREATE POLICY "Service role can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Anyone can read documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents');
```

### STEP 2: Build the Anthropic client (`lib/claude.ts`)

```typescript
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  timeout: 30000, // 30-second timeout on all calls
})

export const haiku = anthropic // Used for extraction tasks
export const sonnet = anthropic // Same client, different model string in calls
export { anthropic }
```

### STEP 3: Build the Sarvam client (`lib/sarvam.ts`)

Sarvam Vision API endpoint: `POST https://api.sarvam.ai/v1/vision/ocr`

```typescript
// Sarvam Vision API for Indian-language OCR
// API docs: https://docs.sarvam.ai/api-reference-docs/getting-started/models/sarvam-vision

export async function sarvamOcr(imageBase64: string, mimeType: 'image/jpeg' | 'image/png' | 'application/pdf'): Promise<string> {
  const response = await fetch('https://api.sarvam.ai/v1/vision/ocr', {
    method: 'POST',
    headers: {
      'api-subscription-key': process.env.SARVAM_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: imageBase64,
      mime_type: mimeType,
      language_hints: ['hi', 'en', 'mr', 'ta', 'te', 'kn', 'ml', 'bn', 'gu', 'pa'],
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Sarvam OCR failed: ${response.status} ${err}`)
  }

  const data = await response.json()
  return data.text ?? data.extracted_text ?? ''
}
```

NOTE: If the Sarvam API endpoint or request format differs from above when you test it, check `https://docs.sarvam.ai` for the correct format and adapt accordingly. The key principle: send base64 image, receive extracted text string.

### STEP 4: Build OCR routing (`lib/ocr.ts`)

```typescript
import { sarvamOcr } from '@/lib/sarvam'
import { haiku } from '@/lib/claude'

function isNonAsciiHeavy(text: string): boolean {
  const nonAscii = text.replace(/[\x00-\x7F]/g, '').length
  return nonAscii / text.length > 0.20
}

export async function extractTextFromDocument(
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const base64 = fileBuffer.toString('base64')

  // For images and PDFs: check a sample of the raw bytes for non-ASCII content
  // A simpler heuristic: try to detect Hindi/regional language scripts in filename or initial bytes
  // Default to Claude Haiku Vision for English, Sarvam for non-English heavy
  
  // Always try Claude Haiku first for English PDFs (faster, cheaper)
  // Use Sarvam if the document appears to be in an Indian language

  // Detection: look for Devanagari (Hindi), Tamil, Telugu, Kannada, Malayalam Unicode ranges
  // in the base64-decoded text of the first page
  const rawText = fileBuffer.toString('utf8', 0, Math.min(5000, fileBuffer.length))
  const hasIndianScript = /[ऀ-ॿ஀-௿ఀ-౿ಀ-೿ഀ-ൿঀ-৿]/.test(rawText)

  if (hasIndianScript) {
    // Route to Sarvam Vision for Indian-language documents
    return sarvamOcr(base64, mimeType as 'image/jpeg' | 'image/png' | 'application/pdf')
  }

  // Claude Haiku Vision for English documents
  const imageMediaType = mimeType.startsWith('image/') ? mimeType : 'image/jpeg'
  const message = await haiku.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: [{
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: base64,
        },
      }, {
        type: 'text',
        text: 'Extract all text from this document exactly as it appears. Return only the extracted text, no commentary.',
      }],
    }],
  })

  return message.content[0].type === 'text' ? message.content[0].text : ''
}
```

### STEP 5: Build the extraction prompt (`prompts/extraction.ts`)

```typescript
export const EXTRACTION_SYSTEM_PROMPT = `You are ClaimRight's document extraction engine. You extract structured facts from Indian health insurance rejection letters.

RULES:
- Return ONLY valid JSON. No markdown, no code fences, no explanation outside the JSON.
- If a field is not clearly present in the document, return null for that field.
- Do NOT infer or guess. Extract only what is explicitly stated.
- Strip all PII before returning: replace patient names with "POLICYHOLDER", phone numbers with "[PHONE REDACTED]", Aadhaar numbers with "[AADHAAR REDACTED]".
- Map the rejection reason to EXACTLY ONE of the 9 canonical categories listed.
- claim_amount must be in rupees as an integer (e.g., 148000 for ₹1,48,000). Return null if not found.
- rejection_date must be in YYYY-MM-DD format. Return null if not found.`

export const EXTRACTION_USER_PROMPT = (documentText: string) => `Extract structured facts from this insurance rejection letter text.

Respond with ONLY this JSON structure (no other text):
{
  "insurer": "<string: name of the insurance company, e.g. 'Star Health and Allied Insurance'> | null",
  "claim_amount": <integer: claim amount in rupees, e.g. 148000> | null,
  "rejection_date": "<string: YYYY-MM-DD format> | null",
  "rejection_reason_raw": "<string: exact rejection reason as stated in the letter, max 500 chars> | null",
  "rejection_reason_category": "<one of: pre_existing_condition | policy_exclusion | documentation_incomplete | non_disclosure | waiting_period | cashless_denial | experimental_treatment | fraud_suspected | other>",
  "documents_requested_count": <integer: number of separate document requests the insurer has made, default 1> | null,
  "policy_type": "<one of: individual | family_floater | group | government_scheme | unknown>",
  "rejection_reason_confidence": <float 0.0-1.0: how confident you are in the category mapping>
}

Document text:
---
${documentText.slice(0, 6000)}
---`
```

### STEP 6: Build the upload API route (`app/api/upload/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { extractTextFromDocument } from '@/lib/ocr'
import { haiku } from '@/lib/claude'
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from '@/prompts/extraction'
import { z } from 'zod'
import { randomUUID } from 'crypto'

// Zod schema for extracted facts
const ExtractedFactsSchema = z.object({
  insurer: z.string().nullable(),
  claim_amount: z.number().int().nullable(),
  rejection_date: z.string().nullable(),
  rejection_reason_raw: z.string().nullable(),
  rejection_reason_category: z.enum([
    'pre_existing_condition', 'policy_exclusion', 'documentation_incomplete',
    'non_disclosure', 'waiting_period', 'cashless_denial',
    'experimental_treatment', 'fraud_suspected', 'other'
  ]),
  documents_requested_count: z.number().int().nullable(),
  policy_type: z.enum(['individual', 'family_floater', 'group', 'government_scheme', 'unknown']),
  rejection_reason_confidence: z.number().min(0).max(1),
})

// Rate limiting (simple in-memory, resets on cold start — fine for MVP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 })
    return true
  }
  if (entry.count >= 5) return false
  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute before trying again.' }, { status: 429 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const email = formData.get('email') as string | null

    if (!file) return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only PDF, JPG, and PNG files are accepted.' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      return NextResponse.json({ error: 'File is too large. Maximum size is 10MB.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const caseId = randomUUID()
    const fileExt = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const storagePath = `${caseId}/rejection-letter.${fileExt}`

    // Upload to Supabase Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, { contentType: file.type })

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    // Create case row
    const { error: caseError } = await supabase.from('cases').insert({
      id: caseId,
      email: email ?? null,
      status: 'uploaded',
      document_path: storagePath,
    })

    if (caseError) throw new Error(`Case creation failed: ${caseError.message}`)

    // Extract text via OCR (async, don't block the response)
    // Return caseId immediately, analysis happens in /api/analyse
    return NextResponse.json({ caseId, message: 'Document uploaded. Redirecting to analysis...' })

  } catch (error) {
    console.error('[upload] Error:', error)
    return NextResponse.json({
      error: 'Upload failed. Please try again.',
    }, { status: 500 })
  }
}
```

### STEP 7: Build the analysis API route (`app/api/analyse/route.ts`)

This route does OCR + extraction + retrieval + scoring:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { extractTextFromDocument } from '@/lib/ocr'
import { haiku } from '@/lib/claude'
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from '@/prompts/extraction'
import { retrieveForCase } from '@/lib/retrieval'
import { calculateFightabilityScore } from '@/lib/scoring'
import { z } from 'zod'

// Same ExtractedFactsSchema as above — move to types/api.ts to avoid duplication

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const caseId = searchParams.get('caseId')
  if (!caseId) return NextResponse.json({ error: 'caseId is required' }, { status: 400 })

  try {
    const supabase = createServiceClient()

    // Get case record
    const { data: caseRow, error: caseError } = await supabase
      .from('cases').select('*').eq('id', caseId).single()
    if (caseError || !caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

    // If already analysed, return existing data
    if (caseRow.status !== 'uploaded') {
      return NextResponse.json({
        caseId,
        insurer: caseRow.insurer,
        claimAmount: caseRow.claim_amount,
        rejectionReasonCategory: caseRow.rejection_reason_category,
        fightabilityScore: caseRow.fightability_score,
        fightabilityReasons: caseRow.fightability_reasons,
      })
    }

    // Download document from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from('documents').download(caseRow.document_path)
    if (fileError || !fileData) throw new Error('Could not retrieve uploaded document')

    const fileBuffer = Buffer.from(await fileData.arrayBuffer())

    // OCR — extract text
    // Determine mime type from document_path
    const ext = caseRow.document_path.split('.').pop()?.toLowerCase()
    const mimeType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg'
    const documentText = await extractTextFromDocument(fileBuffer, mimeType)

    if (!documentText || documentText.trim().length < 50) {
      await supabase.from('cases').update({ status: 'analysed', rejection_reason_category: 'other', fightability_score: 'low' }).eq('id', caseId)
      return NextResponse.json({ caseId, insurer: null, claimAmount: null, rejectionReasonCategory: 'other', fightabilityScore: 'low', fightabilityReasons: [{ reason: 'Could not extract enough text from your document. Please ensure the file is clear and readable.', citation: null }] })
    }

    // Extract structured facts with Claude Haiku
    const extraction = await haiku.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: EXTRACTION_USER_PROMPT(documentText) }],
    })

    const rawJson = extraction.content[0].type === 'text' ? extraction.content[0].text : '{}'
    const cleanJson = rawJson.replace(/```json\n?/g, '').replace(/```/g, '').trim()
    const extractedFacts = ExtractedFactsSchema.parse(JSON.parse(cleanJson))

    // KB retrieval
    const retrievalResult = await retrieveForCase({
      insurerName: extractedFacts.insurer,
      rejectionReasonRaw: extractedFacts.rejection_reason_raw,
      rejectionReasonCategory: extractedFacts.rejection_reason_category,
      claimAmount: extractedFacts.claim_amount,
    })

    // Fightability scoring
    const { score, reasons } = calculateFightabilityScore(extractedFacts, retrievalResult)

    // Update case record
    await supabase.from('cases').update({
      status: 'analysed',
      insurer: extractedFacts.insurer,
      claim_amount: extractedFacts.claim_amount,
      rejection_reason_raw: extractedFacts.rejection_reason_raw,
      rejection_reason_category: extractedFacts.rejection_reason_category,
      rejection_date: extractedFacts.rejection_date,
      fightability_score: score,
      fightability_reasons: reasons,
    }).eq('id', caseId)

    return NextResponse.json({
      caseId,
      insurer: extractedFacts.insurer,
      claimAmount: extractedFacts.claim_amount,
      rejectionReasonCategory: extractedFacts.rejection_reason_category,
      fightabilityScore: score,
      fightabilityReasons: reasons,
    })

  } catch (error) {
    console.error('[analyse] Error:', error)
    return NextResponse.json({ error: 'Analysis failed. Please try again.' }, { status: 500 })
  }
}
```

### STEP 8: Build `lib/scoring.ts`

Implement the rules-based fightability scoring logic exactly as defined in CLAUDE.md. The function signature:

```typescript
export function calculateFightabilityScore(
  facts: z.infer<typeof ExtractedFactsSchema>,
  retrievalResult: RetrievalResult
): { score: FightabilityScore; reasons: FightabilityReason[] }
```

Apply the rules in order as defined in CLAUDE.md (Strong overrides Medium overrides Low). Build reasons array from the actual retrieval results — each reason should include the source title and section number as the citation.

---

## VERIFICATION — DO THIS BEFORE MOVING TO SESSION 4

1. `npx tsc --noEmit` → zero errors
2. Start dev server: `npm run dev`
3. Use a tool like Postman or the browser to POST a test file to `http://localhost:3000/api/upload` with a PDF file and email field
4. Copy the returned `caseId`
5. GET `http://localhost:3000/api/analyse?caseId=<your-caseId>`
6. Verify the response includes `fightabilityScore`, `insurer`, `claimAmount`, and at least one item in `fightabilityReasons`
7. Check Supabase dashboard → Table Editor → cases → the case row should have `status: 'analysed'` and populated fields

---

---

# SESSION 4 — Analysis Results Page + Fightability Score UI

## NO NEW API KEYS NEEDED FOR THIS SESSION

---

## PROMPT (paste everything below this line into Claude Code):

Read the CLAUDE.md file in this folder completely before doing anything else.

This is Session 4. The backend pipeline (upload → OCR → extraction → scoring) is working. Now build the frontend analysis results page.

### YOUR JOB IN THIS SESSION

Build all the frontend screens that don't require payment. Specifically:
1. Landing page (Screen 1) — in `app/page.tsx`
2. Upload page (Screen 2) — in `app/upload/page.tsx`
3. Analysis results page (Screen 3) — in `app/analysis/[caseId]/page.tsx`

Reference the design language from the CLAUDE.md Design System section and look at landing.html for design reference follow the color palette in landing.html. The color palette is deep navy (#0f1f2e) background, white text, accent green (#1f3b2a). Typography: use `DM Serif Display` for headings and `DM Sans` for body — add Google Fonts import in the layout. claude md uses an old deisgn system use these colors instead Warm parchment (#F5F1E8) background with near-black (#14181A) ink and deep forest green (#1F3B2A) as the primary accent, with ember orange (#C86941) used sparingly for alerts and status tags. Typography: Fraunces (variable serif) for headings and Inter for body — JetBrains Mono for labels, kickers, and code-style UI elements. Cards use a slightly lighter cream (#FBF8F1) with a 1px warm rule border. Dark sections flip to a near-black green (#0E1411) base with the same forest/gold accent family. use frontend design skill to make it look great

### SCREEN 1: Landing Page (`app/page.tsx`)

Build a clean, trust-first landing page. Use Tailwind CSS throughout (no separate CSS files).

Key sections to include:
1. **Hero** — Headline: "Got your health insurance claim rejected? Find out if you can fight it." Sub: "ClaimRight analyses your rejection letter against IRDAI regulations and tells you exactly where your insurer went wrong." CTA button: "Upload Your Rejection Letter →" (links to `/upload`)
2. **Trust strip** — 4 stats in a row: "94.5% ombudsman resolution rate" | "30-day settlement deadline (IRDAI rule)" | "₹5,000/day penalty for non-compliance" | "Free for ombudsman filing — no lawyer needed"
3. **How it works** — 3 steps: Upload your rejection letter → AI reads IRDAI regulations → Download your dispute letter
4. **Why trust ClaimRight** — "Every claim in your dispute letter is verified against official IRDAI circulars and real ombudsman awards. If we can't find the regulation, we won't make the claim." This is the core trust message.
5. **Footer** — "NOT A LAW FIRM · NOT LEGAL ADVICE · IRDAI-BASED GUIDANCE ONLY"

### SCREEN 2: Upload Page (`app/upload/page.tsx`)

Build the upload form. This is a client component (`'use client'` at top).

Features:
- Drag-and-drop file upload zone + click to browse
- Accepts: PDF, JPG, PNG only. Max 10MB. Show error if wrong format.
- Email field (required for delivery)
- Privacy notice directly below the upload zone: "Do not include your Aadhaar number, phone number, or policy number. Your document is analyzed by AI and not stored by ClaimRight beyond what's needed to generate your dispute letter."
- "Analyse My Case" submit button
- On submit: POST to `/api/upload`, show loading state ("Reading your rejection letter..."), then redirect to `/analysis/[caseId]`
- Handle errors gracefully with user-friendly messages

### SCREEN 3: Analysis Results Page (`app/analysis/[caseId]/page.tsx`)

This page fetches from `/api/analyse?caseId=` on load. Show a loading state while fetching.

Key UI elements:

**Fightability Score badge** — Large, colored:
- "strong" → green badge with text "Strong Case"
- "medium" → amber badge with text "Worth Fighting"  
- "low" → red badge with text "Difficult Case"

**Case summary strip** — Show what was extracted: Insurer name + Claim amount (formatted as ₹X,XX,XXX)

**Fightability reasons** — 2–3 bullets. Each bullet shows:
- The reason text (plain English)
- The citation below it in a monospace pill (e.g., "IRDAI Master Circular §5.7")

**What happens next** — Short paragraph: "Your dispute letter cites the exact IRDAI regulations your insurer violated. It tells you step by step what to do: file at GRO, then IGMS if needed, then the Insurance Ombudsman (free — 94.5% resolution rate)."

**Primary CTA** — Large button: "Get Your Dispute Letter — ₹99"
Clicking this goes to `/pay/[caseId]`

**Low-score handling** — If fightability_score is "low", show a softer CTA: "Even if this case is difficult, a dispute letter may help. ₹99 →" and add: "Cases are graded Low when we can't find a specific IRDAI regulation that was violated. The dispute letter will still include the relevant policy sections and next steps."

### SHARED LAYOUT (`app/layout.tsx`)

Add:
- Google Fonts: DM Serif Display (400, 300 italic) + DM Sans (400, 500, 600)
- Tailwind base styles
- Dark navy background
- ClaimRight wordmark in nav

---

## VERIFICATION — DO THIS BEFORE MOVING TO SESSION 5

1. `npx tsc --noEmit` → zero errors
2. `npm run dev` → no console errors
3. Visit http://localhost:3000 → landing page renders correctly
4. Click "Upload Your Rejection Letter" → goes to /upload
5. Upload a test PDF → see loading state → redirects to /analysis/[caseId]
6. Analysis page shows: score badge (colored), insurer name, claim amount, reasons with citations, ₹99 CTA
7. All 3 screens look clean on mobile (resize browser to 375px wide)

---

---

# SESSION 5 — Citation-Gated Dispute Letter Generator

## NO NEW API KEYS NEEDED FOR THIS SESSION (Anthropic key from Session 3 is used)

---

## PROMPT (paste everything below this line into Claude Code):

Read the CLAUDE.md file in this folder completely before doing anything else.

This is Session 5. The frontend screens 1–3 and the full analysis pipeline are working. Now build the core product: the citation-gated dispute letter generator.

### YOUR JOB IN THIS SESSION

Build `lib/generation.ts` — the complete 5-step citation-gated pipeline as defined in CLAUDE.md. This is the most important file in the entire codebase. Do not simplify it, bypass it, or skip any step. Every step is required.

Also build the `/api/generate` route that calls this pipeline after payment is confirmed.

### STEP 1: Build the generation system prompt (`prompts/generation.ts`)

```typescript
export const GENERATION_SYSTEM_PROMPT = `You are ClaimRight's dispute letter drafting engine. You draft Indian health insurance dispute letters for submission to an insurer's Grievance Redressal Officer (GRO).

ABSOLUTE RULES — VIOLATIONS WILL CORRUPT THE PRODUCT:
1. Use ONLY the source documents provided in the user message. Do not use any legal knowledge from your training.
2. Every factual legal claim MUST be cited inline in this exact format: [Source: TITLE, §SECTION]
3. Do NOT hallucinate chunk IDs. Every cited chunk ID must be one of the IDs in the KNOWLEDGE BASE CHUNKS section.
4. Do NOT invent snippets. Every citation snippet must be a verbatim excerpt of at least 6 consecutive words from that chunk's text field.
5. If the provided KB chunks do not support a legal claim, DO NOT MAKE THE CLAIM. Write instead: "Note: We recommend seeking additional guidance on this specific point from an insurance advisor."
6. The letter must be formal, professional, and suitable for submission to an Indian insurer's grievance department.
7. Return ONLY valid JSON. No markdown fences. No text outside the JSON structure.

OUTPUT FORMAT:
{
  "subject_line": "string",
  "salutation": "string",
  "body_paragraphs": [
    {
      "text": "paragraph text with inline citations like [Source: TITLE, §SECTION]",
      "citations": [
        {
          "chunk_id": "uuid of the kb_chunk used",
          "regulation_title": "human readable title",
          "section": "section number",
          "snippet": "verbatim quote of 6+ consecutive words from the chunk text"
        }
      ]
    }
  ],
  "closing": "string",
  "relief_sought": "string describing exactly what outcome the policyholder wants"
}`

export const GENERATION_USER_PROMPT = (
  caseDetails: {
    insurer: string
    claimAmount: number
    rejectionReasonRaw: string
    rejectionReasonCategory: string
    rejectionDate: string | null
  },
  kbChunks: Array<{
    id: string
    source_title: string
    section_number: string | null
    content: string
    issuer: string
    circular_number: string | null
  }>
): string => {
  const chunksText = kbChunks.map(c => `
--- CHUNK ---
id: ${c.id}
source: ${c.source_title} ${c.circular_number ? `(${c.circular_number})` : ''}, §${c.section_number ?? 'N/A'}
issuer: ${c.issuer}
text: ${c.content.slice(0, 1200)}
`).join('\n')

  return `Draft a formal GRO complaint letter for this case.

CASE DETAILS:
- Insurer: ${caseDetails.insurer}
- Claim Amount: ₹${(caseDetails.claimAmount / 100).toLocaleString('en-IN')}
- Rejection Reason: ${caseDetails.rejectionReasonRaw}
- Rejection Category: ${caseDetails.rejectionReasonCategory.replace(/_/g, ' ')}
- Rejection Date: ${caseDetails.rejectionDate ?? 'Not specified'}
- Addressed to: Grievance Redressal Officer

KNOWLEDGE BASE CHUNKS (use ONLY these — cite by chunk id):
${chunksText}

Draft the letter now. Cite every legal claim. Do not make claims not supported by the above chunks.`
}
```

### STEP 2: Build `lib/generation.ts` — the 5-step pipeline

Implement the complete pipeline as defined in CLAUDE.md. Key implementation details:

```typescript
import { sonnet } from '@/lib/claude'
import { retrieveForCase } from '@/lib/retrieval'
import { GENERATION_SYSTEM_PROMPT, GENERATION_USER_PROMPT } from '@/prompts/generation'
import { createServiceClient } from '@/lib/supabase'
import { z } from 'zod'

// Zod schema for the letter output
const LetterParagraphSchema = z.object({
  text: z.string(),
  citations: z.array(z.object({
    chunk_id: z.string().uuid(),
    regulation_title: z.string(),
    section: z.string(),
    snippet: z.string().min(6), // at least 6 words
  })),
})

const LetterOutputSchema = z.object({
  subject_line: z.string(),
  salutation: z.string(),
  body_paragraphs: z.array(LetterParagraphSchema),
  closing: z.string(),
  relief_sought: z.string(),
})

// Token overlap calculator for span validation
function tokenize(text: string): Set<string> {
  const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'was', 'are', 'were', 'be', 'been', 'shall', 'should', 'may', 'must'])
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9ऀ-ॿ\s]/g, '') // keep ASCII + Devanagari
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t))
  )
}

function tokenOverlapCoefficient(snippet: string, chunkText: string): number {
  const snippetTokens = tokenize(snippet)
  const chunkTokens = tokenize(chunkText)
  if (snippetTokens.size === 0) return 0
  let intersection = 0
  for (const t of snippetTokens) {
    if (chunkTokens.has(t)) intersection++
  }
  return intersection / Math.min(snippetTokens.size, chunkTokens.size)
}

type ValidationStatus = 'pass' | 'flag' | 'fail'

interface ValidatedParagraph {
  text: string
  validatedText: string // text with softened language for flagged claims
  citations: Array<{
    chunk_id: string
    regulation_title: string
    section: string
    snippet: string
    overlap: number
    status: ValidationStatus
  }>
  hasRemovedClaims: boolean
}

export interface GenerationResult {
  subjectLine: string
  salutation: string
  paragraphs: ValidatedParagraph[]
  closing: string
  reliefSought: string
  citationsTotal: number
  citationsFailed: number
  citationsFlagged: number
  kbMissNote: string | null // set if no KB chunks matched above threshold
}

export async function generateDisputeLetter(caseId: string): Promise<GenerationResult> {
  const supabase = createServiceClient()

  // Load case data
  const { data: caseRow } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (!caseRow) throw new Error('Case not found')
  if (!caseRow.rejection_reason_raw) throw new Error('No rejection reason on case — cannot generate letter')

  // STEP 1: RETRIEVAL
  const retrievalResult = await retrieveForCase({
    insurerName: caseRow.insurer,
    rejectionReasonRaw: caseRow.rejection_reason_raw,
    rejectionReasonCategory: caseRow.rejection_reason_category,
    claimAmount: caseRow.claim_amount,
  })

  // KB MISS CHECK: if top score < 0.65, we cannot generate a well-cited letter
  if (retrievalResult.topScore < 0.65) {
    return {
      subjectLine: `Formal Grievance Regarding Rejection of Health Insurance Claim`,
      salutation: 'Dear Grievance Redressal Officer,',
      paragraphs: [{
        text: `I am writing to formally dispute the rejection of my health insurance claim for ₹${caseRow.claim_amount ? (caseRow.claim_amount / 100).toLocaleString('en-IN') : '[amount]'}. The stated reason for rejection was: "${caseRow.rejection_reason_raw}". I request a detailed review of this decision.\n\nNote: We were unable to find a specific IRDAI regulation directly applicable to your stated rejection reason in our current knowledge base. We recommend consulting an insurance advisor for additional regulatory arguments specific to your case. This letter establishes the formal grievance on record.`,
        validatedText: `I am writing to formally dispute the rejection of my health insurance claim. Note: We were unable to find a specific IRDAI regulation directly applicable to your stated rejection reason. We recommend consulting an insurance advisor.`,
        citations: [],
        hasRemovedClaims: false,
      }],
      closing: 'I request resolution within 15 days as required under IRDAI guidelines. Failure to respond shall be treated as grounds for escalation to IGMS and the Insurance Ombudsman.',
      reliefSought: `Reinstatement and settlement of the rejected claim of ₹${caseRow.claim_amount ? (caseRow.claim_amount / 100).toLocaleString('en-IN') : '[amount]'} with applicable interest under IRDAI regulations.`,
      citationsTotal: 0,
      citationsFailed: 0,
      citationsFlagged: 0,
      kbMissNote: 'No specific IRDAI regulation found for this rejection reason. Letter is a general grievance filing.',
    }
  }

  // STEP 2: GENERATION (RAG)
  const generationResponse = await sonnet.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: GENERATION_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: GENERATION_USER_PROMPT(
        {
          insurer: caseRow.insurer ?? 'the insurer',
          claimAmount: caseRow.claim_amount ?? 0,
          rejectionReasonRaw: caseRow.rejection_reason_raw,
          rejectionReasonCategory: caseRow.rejection_reason_category,
          rejectionDate: caseRow.rejection_date,
        },
        retrievalResult.chunks
      ),
    }],
  })

  const rawJson = generationResponse.content[0].type === 'text' ? generationResponse.content[0].text : '{}'
  const cleanJson = rawJson.replace(/```json\n?/g, '').replace(/```/g, '').trim()
  const letterOutput = LetterOutputSchema.parse(JSON.parse(cleanJson))

  // Build a lookup map from chunk_id → chunk content for span validation
  const chunkMap = new Map(retrievalResult.chunks.map(c => [c.id, c]))

  // STEPS 3 + 4: SPAN VALIDATION + FILTERING
  let citationsTotal = 0
  let citationsFailed = 0
  let citationsFlagged = 0

  const validatedParagraphs: ValidatedParagraph[] = letterOutput.body_paragraphs.map(para => {
    let validatedText = para.text
    const validatedCitations = para.citations.map(citation => {
      citationsTotal++
      const chunk = chunkMap.get(citation.chunk_id)

      // FAIL: chunk_id doesn't exist in retrieved set
      if (!chunk) {
        citationsFailed++
        return { ...citation, overlap: 0, status: 'fail' as ValidationStatus }
      }

      const overlap = tokenOverlapCoefficient(citation.snippet, chunk.content)

      if (overlap >= 0.70) {
        return { ...citation, overlap, status: 'pass' as ValidationStatus }
      } else if (overlap >= 0.40) {
        citationsFlagged++
        // Soften the language for flagged citations
        validatedText = validatedText.replace(
          new RegExp(`([.!?])\\s*([^.!?]*${escapeRegex(citation.section)}[^.!?]*)`, 'g'),
          (match) => match.replace(/\b(violates|violated|required by|mandated by)\b/gi, 'may not comply with')
        )
        return { ...citation, overlap, status: 'flag' as ValidationStatus }
      } else {
        citationsFailed++
        // Remove the entire sentence containing this citation from validatedText
        const citationRef = `[Source: ${citation.regulation_title}`
        const sentencePattern = new RegExp(`[^.!?]*${escapeRegex(citationRef)}[^.!?]*[.!?]`, 'g')
        validatedText = validatedText.replace(sentencePattern, '').trim()
        return { ...citation, overlap, status: 'fail' as ValidationStatus }
      }
    })

    const hasRemovedClaims = validatedCitations.some(c => c.status === 'fail')
    if (hasRemovedClaims) {
      validatedText += '\n\n[Note: Some regulatory citations were removed from this paragraph as they could not be verified against our source documents. We recommend consulting an insurance advisor for additional arguments.]'
    }

    return {
      text: para.text,
      validatedText,
      citations: validatedCitations,
      hasRemovedClaims,
    }
  })

  return {
    subjectLine: letterOutput.subject_line,
    salutation: letterOutput.salutation,
    paragraphs: validatedParagraphs,
    closing: letterOutput.closing,
    reliefSought: letterOutput.relief_sought,
    citationsTotal,
    citationsFailed,
    citationsFlagged,
    kbMissNote: null,
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
```

### STEP 3: Build the `/api/generate` route

This route is ONLY accessible after payment is confirmed (status === 'paid'):

```typescript
export async function POST(request: NextRequest) {
  const { caseId } = await request.json()
  if (!caseId) return NextResponse.json({ error: 'caseId required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: caseRow } = await supabase.from('cases').select('*').eq('id', caseId).single()

  if (!caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if (caseRow.status !== 'paid') return NextResponse.json({ error: 'Payment required before generating letter' }, { status: 403 })

  try {
    const result = await generateDisputeLetter(caseId)
    // Store result and generate PDF (PDF generation in Session 7)
    // For now, update status to 'generated' and store a JSON version of the letter
    await supabase.from('cases').update({
      status: 'generated',
      fightability_reasons: JSON.stringify(result), // temporary until PDF generation
    }).eq('id', caseId)

    return NextResponse.json({ caseId, message: 'Letter generated', citationsFailed: result.citationsFailed })
  } catch (error) {
    console.error('[generate]', error)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
```

---

## VERIFICATION — DO THIS BEFORE MOVING TO SESSION 6

1. `npx tsc --noEmit` → zero errors
2. Run `npm run dev`
3. Upload a test rejection letter, get caseId
4. Manually set the case status to 'paid' in Supabase dashboard (for testing without Razorpay yet)
5. POST to `/api/generate` with the caseId
6. Verify response includes letter content
7. Verify `citationsFailed` is 0 or low (≤1 for a well-populated KB)
8. Check that the letter paragraphs contain `[Source: ...]` style citations that match KB content
9. Test the KB miss path: run analysis on a document with an unusual rejection reason (e.g., "claim rejected for experimental treatment XYZ") and verify the letter includes the "unable to find regulation" note

---

---

# SESSION 6 — Payment Screen + Download Screen + PDF Generation

## BEFORE PASTING THIS INTO CLAUDE CODE, DO THIS FIRST:
**Start your Razorpay KYC now if you haven't already.** It takes 2–7 business days.
1. Go to **razorpay.com** → sign up → complete KYC (business registration, bank account, PAN)
2. While waiting for KYC, you can use Razorpay test mode keys for development:
   - Dashboard → Settings → API Keys → Generate Test Key
3. Also sign up for **resend.com** → get free API key (3,000 emails/month free)
4. Add to `.env.local`:
   ```
   RAZORPAY_KEY_ID=rzp_test_...
   RAZORPAY_KEY_SECRET=...
   RESEND_API_KEY=re_...
   NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
   ```

---

## PROMPT (paste everything below this line into Claude Code):

Read the CLAUDE.md file in this folder completely before doing anything else.

This is Session 6. The full analysis pipeline and dispute letter generator are working. Now build payment, PDF generation, email delivery, and the final two screens.

### YOUR JOB IN THIS SESSION

1. Build the Razorpay payment integration
2. Build PDF generation from the letter output
3. Build email delivery via Resend
4. Build Screen 4 (Payment page) and Screen 5 (Download page)

### STEP 1: Install Razorpay and pdf-lib

```bash
npm install razorpay
npm install @types/razorpay
```

### STEP 2: Build the payment API routes

**`app/api/payment/route.ts`** — creates a Razorpay order:
```typescript
import Razorpay from 'razorpay'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

export async function POST(request: NextRequest) {
  const { caseId } = await request.json()
  if (!caseId) return NextResponse.json({ error: 'caseId required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: caseRow } = await supabase.from('cases').select('*').eq('id', caseId).single()
  if (!caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if (caseRow.status === 'paid') return NextResponse.json({ error: 'Already paid' }, { status: 400 })

  // ₹99 = 9900 paise
  const order = await razorpay.orders.create({
    amount: 9900,
    currency: 'INR',
    receipt: caseId.slice(0, 40),
    notes: { caseId },
  })

  await supabase.from('cases').update({ razorpay_order_id: order.id }).eq('id', caseId)

  return NextResponse.json({
    orderId: order.id,
    amount: 9900,
    currency: 'INR',
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
  })
}
```

**`app/api/payment/verify/route.ts`** — verifies webhook and triggers letter generation:
```typescript
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { generateDisputeLetter } from '@/lib/generation'
import { generatePdf } from '@/lib/pdf'
import { sendDisputeLetterEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex')

  if (expectedSignature !== razorpay_signature) {
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Find the case by order ID
  const { data: caseRow } = await supabase
    .from('cases').select('*').eq('razorpay_order_id', razorpay_order_id).single()

  if (!caseRow) return NextResponse.json({ error: 'Case not found for this order' }, { status: 404 })

  // Update payment status
  await supabase.from('cases').update({
    status: 'paid',
    razorpay_payment_id,
    paid_at: new Date().toISOString(),
  }).eq('id', caseRow.id)

  // Generate dispute letter + PDF + email (in background, don't block response)
  generateAndDeliver(caseRow.id, supabase).catch(err => console.error('[payment/verify] Delivery error:', err))

  return NextResponse.json({ success: true, caseId: caseRow.id })
}

async function generateAndDeliver(caseId: string, supabase: any) {
  const letterResult = await generateDisputeLetter(caseId)
  const pdfBuffer = await generatePdf(letterResult)

  // Upload PDF to Supabase Storage
  const pdfPath = `${caseId}/dispute-letter.pdf`
  await supabase.storage.from('documents').upload(pdfPath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  })

  await supabase.from('cases').update({
    status: 'generated',
    letter_path: pdfPath,
  }).eq('id', caseId)

  // Get signed URL for download
  const { data: urlData } = await supabase.storage
    .from('documents').createSignedUrl(pdfPath, 60 * 60 * 24) // 24-hour expiry

  // Get case email
  const { data: caseRow } = await supabase.from('cases').select('email').eq('id', caseId).single()

  if (caseRow?.email && urlData?.signedUrl) {
    await sendDisputeLetterEmail(caseRow.email, caseId, urlData.signedUrl)
    await supabase.from('cases').update({ status: 'delivered' }).eq('id', caseId)
  }
}
```

### STEP 3: Build PDF generation (`lib/pdf.ts`)

Use `pdf-lib` to create a clean, professional PDF:

```typescript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { GenerationResult } from '@/lib/generation'

export async function generatePdf(letter: GenerationResult): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842]) // A4 in points

  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  const courier = await pdfDoc.embedFont(StandardFonts.Courier)

  const { width, height } = page.getSize()
  const margin = 72 // 1 inch
  let y = height - margin

  // Helper to add text and advance y cursor
  function drawText(text: string, options: { font?: any; size?: number; color?: any; indent?: number } = {}) {
    const font = options.font ?? timesRoman
    const size = options.size ?? 11
    const indent = options.indent ?? 0
    const color = options.color ?? rgb(0, 0, 0)
    const maxWidth = width - 2 * margin - indent

    // Word wrap
    const words = text.split(' ')
    let line = ''
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word
      const lineWidth = font.widthOfTextAtSize(testLine, size)
      if (lineWidth > maxWidth && line) {
        if (y < margin + 20) { pdfDoc.addPage([595, 842]); y = height - margin }
        page.drawText(line, { x: margin + indent, y, size, font, color })
        y -= size + 4
        line = word
      } else {
        line = testLine
      }
    }
    if (line) {
      if (y < margin + 20) { pdfDoc.addPage([595, 842]); y = height - margin }
      page.drawText(line, { x: margin + indent, y, size, font, color })
      y -= size + 4
    }
  }

  // Header
  drawText('CLAIMRIGHT', { font: timesRomanBold, size: 14 })
  drawText('Health Insurance Dispute Letter', { size: 11, color: rgb(0.3, 0.3, 0.3) })
  y -= 8

  // Divider line
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  y -= 20

  // Subject
  drawText(letter.subjectLine, { font: timesRomanBold, size: 12 })
  y -= 8

  // Salutation
  drawText(letter.salutation)
  y -= 6

  // Body paragraphs
  for (const para of letter.paragraphs) {
    drawText(para.validatedText, { size: 11 })
    y -= 8
  }

  // Relief sought
  y -= 8
  drawText('Relief Sought:', { font: timesRomanBold })
  drawText(letter.reliefSought)
  y -= 8

  // Closing
  drawText(letter.closing)
  y -= 20
  drawText('Yours sincerely,')
  y -= 30
  drawText('Policyholder')
  y -= 20

  // Footer
  const footerText = 'This letter is based on verified IRDAI regulations and ombudsman precedents. All citations are sourced from official IRDAI circulars. This is not legal advice.'
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
  y -= 14
  drawText(footerText, { size: 8, color: rgb(0.5, 0.5, 0.5) })

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}
```

### STEP 4: Build email delivery (`lib/email.ts`)

```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendDisputeLetterEmail(
  email: string,
  caseId: string,
  downloadUrl: string
): Promise<void> {
  await resend.emails.send({
    from: 'ClaimRight <noreply@claimright.in>',
    to: email,
    subject: 'Your Dispute Letter is Ready — ClaimRight',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
        <h2 style="color: #0f1f2e;">Your dispute letter is ready.</h2>
        <p>Your ClaimRight dispute letter has been generated and is ready to download. It cites the specific IRDAI regulations and ombudsman precedents relevant to your case.</p>
        <p><a href="${downloadUrl}" style="display:inline-block;background:#1f3b2a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Download Your Dispute Letter</a></p>
        <p style="color:#666;font-size:13px;">This link expires in 24 hours. <a href="https://claimright.in/download/${caseId}">Log back in to get a fresh link.</a></p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <h3 style="color:#0f1f2e;">What to do next:</h3>
        <ol style="color:#444;line-height:1.7;">
          <li><strong>Step 1 — GRO:</strong> Email or post the dispute letter to your insurer's Grievance Redressal Officer. The insurer must respond within 15 days.</li>
          <li><strong>Step 2 — IGMS:</strong> If no satisfactory response in 15 days, file at bimabharosa.irdai.gov.in using the reference number from your insurer's response.</li>
          <li><strong>Step 3 — Ombudsman:</strong> If still unresolved, file at cioins.co.in — it's free, takes 1–3 months, and the resolution rate is 94.5%.</li>
        </ol>
        <p style="color:#999;font-size:11px;">NOT LEGAL ADVICE. NOT A LAW FIRM. This letter is based on IRDAI regulations for guidance only.</p>
      </div>
    `,
  })
}
```

### STEP 5: Build Screen 4 — Payment Page (`app/pay/[caseId]/page.tsx`)

Client component. On load, fetches case details. Shows:
- What they're buying: "Your IRDAI-Backed Dispute Letter"
- Bullet list: "Formal GRO complaint letter citing your insurer's specific violations" / "Exact IRDAI regulation clauses that apply to your case" / "Step-by-step escalation path to the Insurance Ombudsman" / "Emailed to you as a PDF"
- Price: **₹99** (display large)
- Razorpay checkout button

Razorpay checkout implementation:
```typescript
// Load Razorpay script dynamically
useEffect(() => {
  const script = document.createElement('script')
  script.src = 'https://checkout.razorpay.com/v1/checkout.js'
  document.body.appendChild(script)
}, [])

async function handlePayment() {
  // 1. Create order via /api/payment
  const orderRes = await fetch('/api/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId }),
  })
  const order = await orderRes.json()

  // 2. Open Razorpay checkout
  const options = {
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    name: 'ClaimRight',
    description: 'Health Insurance Dispute Letter',
    order_id: order.orderId,
    handler: async (response: any) => {
      // 3. Verify payment
      const verifyRes = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      })
      const verifyData = await verifyRes.json()
      if (verifyData.success) {
        router.push(`/download/${caseId}`)
      }
    },
    prefill: { email: caseEmail },
    theme: { color: '#1f3b2a' },
  }

  const rzp = new (window as any).Razorpay(options)
  rzp.open()
}
```

### STEP 6: Build Screen 5 — Download Page (`app/download/[caseId]/page.tsx`)

Shows:
- "Your dispute letter is ready."
- Download button (fetches a signed URL from Supabase Storage via a new `/api/download/[caseId]` route)
- "What to do next" — 3 steps (same as the email)
- Trust note: "Your letter cites [N] IRDAI regulations. All citations are verified."

---

## VERIFICATION — DO THIS BEFORE MOVING TO SESSION 7

1. `npx tsc --noEmit` → zero errors
2. `npm run dev`
3. Complete full flow end-to-end using Razorpay TEST mode:
   - Upload rejection letter → see analysis → click "Get Your Dispute Letter — ₹99" → payment page loads
   - Use Razorpay test card: 4111 1111 1111 1111, expiry: any future date, CVV: any 3 digits
   - After payment: redirected to download page
   - Check Resend dashboard (or email) → email received with PDF attachment link
   - Download the PDF → open it → verify it has: subject line, regulation citations, relief sought, footer

---

---

# SESSION 7 — Final Polish + Rate Limiting + Error Handling

## NO NEW API KEYS NEEDED FOR THIS SESSION

---

## PROMPT (paste everything below this line into Claude Code):

Read the CLAUDE.md file in this folder completely before doing anything else.

This is Session 7. The full end-to-end flow is working: upload → OCR → analysis → payment → letter → PDF → email. This session is about hardening the product so it doesn't break or embarrass us in front of real users.

### YOUR JOB IN THIS SESSION

1. Harden all error states — every route must handle failures gracefully with user-friendly messages
2. Add proper rate limiting to all public API routes
3. Add loading states and skeleton screens to all frontend pages
4. Add a fallback path for when the Anthropic API is down
5. Add the `not_a_rejection_letter` detection so users who upload random documents get a friendly error
6. Test and fix all edge cases before deployment

### STEP 1: Upgrade rate limiting across all API routes

Replace the simple in-memory rate limit with a more robust version. Create `lib/rate-limit.ts`:

```typescript
// Simple but effective rate limiting for MVP
// Uses in-memory Map — resets on serverless cold start
// Good enough for MVP; upgrade to Redis/Upstash in production

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export function rateLimit(
  identifier: string,
  options: { maxRequests: number; windowMs: number }
): { success: boolean; remaining: number } {
  const now = Date.now()
  const entry = store.get(identifier)

  if (!entry || now > entry.resetAt) {
    store.set(identifier, { count: 1, resetAt: now + options.windowMs })
    return { success: true, remaining: options.maxRequests - 1 }
  }

  if (entry.count >= options.maxRequests) {
    return { success: false, remaining: 0 }
  }

  entry.count++
  return { success: true, remaining: options.maxRequests - entry.count }
}
```

Apply to all API routes:
- `/api/upload`: 5 requests per IP per minute
- `/api/analyse`: 10 requests per IP per minute
- `/api/generate`: 3 requests per IP per 5 minutes
- `/api/payment`: 5 requests per IP per minute

### STEP 2: Add document validation to the upload route

Before processing, validate the document:
1. Check file size (max 10MB — already implemented, verify it's there)
2. Check MIME type (PDF, JPG, PNG only — already implemented)
3. Add a text detection step: after OCR, if the extracted text is fewer than 50 characters, return a user-friendly error: "We couldn't extract enough text from your document. Please ensure your file is a clear, readable rejection letter from your insurance company."
4. Add insurance document detection: after extraction, if `rejection_reason_category` is 'other' AND `rejection_reason_confidence` is below 0.3, show: "This doesn't appear to be an insurance rejection letter. Please upload the rejection letter you received from your insurer."

### STEP 3: Add skeleton loading screens to all pages

The analysis page currently shows blank while fetching. Add skeleton screens:
- Landing page: instant (no data fetch)
- Upload page: instant (no data fetch)
- Analysis page: show animated skeleton cards while waiting for `/api/analyse` to respond
- Pay page: show skeleton while creating Razorpay order
- Download page: show "Generating your letter..." animation while letter is being created (poll the case status every 3 seconds)

### STEP 4: Add comprehensive error boundaries

Create `app/error.tsx` and `app/global-error.tsx` that catch React errors and show a friendly "Something went wrong" page with a "Try again" button and a mailto link to support.

### STEP 5: Add the "what if Claude is down?" fallback

In `app/api/analyse/route.ts`, wrap the Claude API call in a try/catch. If it fails:
- Still return a response with a basic fightability score
- Set `fightability_score: 'medium'` with one reason: "Document received. Detailed analysis temporarily unavailable — try refreshing in 2 minutes."
- Do NOT leave the user with a hard error that blocks the checkout

### STEP 6: Privacy audit

Do a final pass to ensure:
- No patient names, phone numbers, or Aadhaar numbers are stored in the database
- All regex-based PII stripping from the extraction prompt is actually working (write a test for this)
- The document_path in Supabase Storage uses UUID (not original filename)
- The API response to the frontend never includes the full document text

### STEP 7: Clean up all TypeScript errors and console.logs

Run `npx tsc --noEmit`. Fix all errors. Remove any `console.log` debug statements that expose sensitive data.

---

## VERIFICATION — DO THIS BEFORE MOVING TO SESSION 8

1. `npx tsc --noEmit` → zero errors
2. Test all failure modes:
   a. Upload a non-insurance document (a photo of your face or a blank PDF) → verify graceful error
   b. Upload an oversized file (>10MB) → verify error message
   c. Refresh the analysis page during loading → no crash
   d. Open the download page for a case that hasn't been paid → correct error state
3. Check that no sensitive data appears in browser dev tools Network tab responses
4. Verify the analysis page has a loading skeleton (not a blank screen)
5. Run the full flow one more time end-to-end in test mode to confirm nothing broke

---

---

# SESSION 8 — Vercel Deployment + Domain + Production Checklist

## BEFORE PASTING THIS INTO CLAUDE CODE, DO THIS FIRST:
1. Create a **GitHub account** (if you don't have one) at github.com
2. Create a new private GitHub repository named `claimright-code`
3. Push all your local code to that repo (Claude Code can help you with the git commands)
4. Create a **Vercel account** at vercel.com (free — sign in with GitHub)
5. If you have a domain (`claimright.in`), have your domain registrar login ready (you'll add DNS records)
6. Switch Razorpay keys from test to live in `.env.local` (requires KYC to be approved — if not yet approved, stay on test mode for now)

---

## PROMPT (paste everything below this line into Claude Code):

Read the CLAUDE.md file in this folder completely before doing anything else.

This is Session 8, the final session. The product is fully built and tested locally. Now deploy it to production.

### YOUR JOB IN THIS SESSION

1. Set up the Vercel deployment
2. Configure all environment variables in Vercel
3. Connect the domain
4. Run a full production end-to-end test
5. Confirm the product is live and ready for real users

### STEP 1: Prepare for deployment

Add a `vercel.json` to the project root:
```json
{
  "functions": {
    "app/api/payment/verify/route.ts": {
      "maxDuration": 60
    },
    "app/api/generate/route.ts": {
      "maxDuration": 60
    },
    "app/api/analyse/route.ts": {
      "maxDuration": 45
    }
  }
}
```

These timeouts are needed because generation (Claude Sonnet) and analysis (OCR + Claude Haiku) can take 20–40 seconds for complex documents.

Verify `.gitignore` contains:
```
.env.local
.env*.local
node_modules/
.next/
scripts/source-docs/*.pdf
scripts/test-docs/
```

### STEP 2: Deploy to Vercel

Go to vercel.com → New Project → Import from GitHub → select `claimright-code` → Deploy.

In Vercel project settings → Environment Variables, add ALL of the following for Production + Preview + Development environments:

```
NEXT_PUBLIC_SUPABASE_URL          = your Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     = your Supabase anon key
SUPABASE_SERVICE_ROLE_KEY         = your Supabase service role key
VOYAGE_API_KEY                    = your Voyage AI key
ANTHROPIC_API_KEY                 = your Anthropic API key
SARVAM_API_KEY                    = your Sarvam API key
RAZORPAY_KEY_ID                   = rzp_live_... (or rzp_test_... if KYC pending)
RAZORPAY_KEY_SECRET               = your Razorpay secret
RESEND_API_KEY                    = your Resend API key
NEXT_PUBLIC_RAZORPAY_KEY_ID       = rzp_live_... (same as RAZORPAY_KEY_ID, must be public)
```

After adding all variables, trigger a new deployment.

### STEP 3: Connect your domain

In Vercel project → Settings → Domains → Add Domain → type `claimright.in` (or whatever domain you have).

Vercel will show you DNS records to add. Go to your domain registrar and add:
- Type A: points to Vercel's IP (76.76.21.21)
- Type CNAME: www → cname.vercel-dns.com

DNS propagation: 10–60 minutes typically.

If you don't have a domain yet, the site is live at `claimright-code.vercel.app` — this is a working URL you can share.

### STEP 4: Set up Razorpay webhook in production

1. Log into Razorpay dashboard → Settings → Webhooks → Add Webhook
2. URL: `https://claimright.in/api/payment/verify` (or your Vercel URL)
3. Events to listen for: `payment.captured`
4. Secret: use your `RAZORPAY_KEY_SECRET`

This ensures the payment verification fires even if the user closes the browser after paying.

### STEP 5: Update Resend sender domain

In Resend dashboard → Domains → Add Domain → add `claimright.in`. Follow their DNS instructions to verify. Once verified, emails from `noreply@claimright.in` will pass DKIM/SPF checks and not land in spam.

### STEP 6: Run a full production end-to-end test

Using the live Vercel URL (not localhost):
1. Go to the landing page — verify it renders
2. Upload a real rejection letter PDF
3. Wait for analysis results — verify score, insurer, reasons appear
4. Complete a test payment (if using live Razorpay, use ₹1 as a test or keep test keys temporarily)
5. Verify the download page appears
6. Verify the email is received with the PDF link

### STEP 7: Production launch checklist

Before sharing the URL with anyone, verify all of the following:

**Security:**
- [ ] `.env.local` is NOT in the GitHub repo (check the repo on github.com)
- [ ] No API keys appear in the deployed JavaScript (check browser source → search for "sk-ant", "rzp_", "supabase")
- [ ] All API routes have rate limiting
- [ ] SUPABASE_SERVICE_ROLE_KEY is only used server-side (never in client components)

**Function:**
- [ ] File upload works on mobile (test on your phone)
- [ ] Analysis returns correct fightability score for a real rejection letter
- [ ] Payment flow completes (test mode ok for now)
- [ ] PDF downloads correctly
- [ ] Email arrives with PDF link

**Content:**
- [ ] Footer says "NOT A LAW FIRM · NOT LEGAL ADVICE · IRDAI-BASED GUIDANCE ONLY"
- [ ] Privacy notice is visible on the upload screen
- [ ] All prices show ₹99

**KB:**
- [ ] At least 1 IRDAI circular has been ingested into kb_chunks (check Supabase)
- [ ] `npx tsx --env-file=.env.local scripts/validate-kb.ts` returns valid results on the production Supabase database

### STEP 8: Share with first users

Once the checklist is complete, the product is live. Share with:
1. The 10 insurance agents Asher has ready to refer cases
2. The Indian hospital network that agreed to market at launch
3. Post on r/personalfinanceindia with the story about Asher's mother's case

---

## VERIFICATION — FINAL

1. Visit the live URL on your phone → landing page renders correctly
2. Upload a real rejection letter → see analysis → CTA appears
3. Supabase dashboard → cases table → confirm the case row exists and is populated
4. Check GoatCounter or Vercel Analytics for first traffic

**🎉 ClaimRight is live.**

---

---

## QUICK REFERENCE — API KEYS AND WHERE TO GET THEM

| Key | Where | Cost |
|-----|-------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | supabase.com → Project Settings → API | Free |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | supabase.com → Project Settings → API | Free |
| `SUPABASE_SERVICE_ROLE_KEY` | supabase.com → Project Settings → API | Free |
| `VOYAGE_API_KEY` | voyageai.com → Account → API Keys | 200M free tokens then ~$0.12/1M |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | ~₹80/case for Haiku+Sonnet blend |
| `SARVAM_API_KEY` | sarvam.ai → Dashboard | Free credits included |
| `RAZORPAY_KEY_ID` | razorpay.com → Settings → API Keys | 2% per transaction |
| `RAZORPAY_KEY_SECRET` | razorpay.com → Settings → API Keys | Same |
| `RESEND_API_KEY` | resend.com → API Keys | 3,000 emails/month free |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Same as RAZORPAY_KEY_ID | Same |

**Total cost to run for first 100 cases at ₹99/case:**
- Revenue: ₹9,900
- API costs: ~₹1,200 (Anthropic ~₹80 × 100 cases)
- Razorpay fees: ~₹198 (2% × ₹9,900)
- Everything else: free tier
- **Net after costs: ~₹8,500 from first 100 cases**
