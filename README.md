# ClaimRight

**Live:** https://claim-right-v-1.vercel.app

AI-powered health insurance dispute co-pilot for India. A user uploads their rejection letter. The system reads it, extracts the facts, searches a curated knowledge base of IRDAI regulations and ombudsman awards, generates a Fightability Score with real citations, and produces a downloadable dispute letter PDF.

₹26,037 crore in health insurance claims were rejected in FY2023-24 (IRDAI Annual Report FY24). Less than 1% of those claimants formally dispute. When they do, the Insurance Ombudsman resolved 94.5% of complaints in the same year. ClaimRight exists to close that gap.

---

## How it works

1. User uploads a rejection letter (PDF or image)
2. Claude Haiku 4.5 Vision extracts structured facts: insurer, claim amount, rejection reason, date
3. The rejection reason is classified into one of 9 canonical categories
4. Hybrid vector + full-text search retrieves the most relevant IRDAI regulation chunks from Supabase (pgvector)
5. The Fightability Score is calculated: `low`, `medium`, or `strong`
6. After ₹99 payment, Claude Sonnet 4.6 drafts a dispute letter using only the retrieved source chunks
7. Every inline citation is validated against the source chunk via token overlap coefficient — sentences that cannot be grounded in the KB are removed or softened
8. The validated letter is rendered to PDF and emailed to the user

The core guarantee: every factual legal claim in every dispute letter traces to a verified IRDAI circular or ombudsman award. The pipeline never generates uncited text and never invents regulations.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + hosting | Next.js 14 (App Router) + Vercel | Zero-config deploys, App Router for streaming |
| Styles | Tailwind CSS | |
| Database + vector search | Supabase (PostgreSQL + pgvector HNSW) | One service for relational data, vector search, and file storage |
| Embeddings | Voyage AI `voyage-law-2` | Fine-tuned for legal retrieval; 1024 dimensions, 16k context |
| OCR | Claude Haiku 4.5 Vision | Native PDF + image support; handles English and Indian-script documents |
| Extraction + scoring | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | Fast, cheap structured JSON extraction |
| Letter generation | Claude Sonnet 4.6 (`claude-sonnet-4-6`) | Better citation adherence on the post-payment RAG path |
| Payments | Razorpay | UPI + card + netbanking; standard for India |
| Email | Resend | Simple API, 3,000 free emails/month |
| PDF generation | pdf-lib | Runs in Vercel serverless |
| Rate limiting | Upstash Redis | 5 req/IP/min on all public routes |
| Types + validation | TypeScript + Zod | All external API responses validated at runtime |

---

## Anti-hallucination pipeline

This is the technical core of the product. DoNotPay was fined $193,000 by the FTC in 2025 for AI legal claims it could not substantiate. Stanford HAI found legal AI hallucinates citations in 1 out of 6+ queries even when citations are present. ClaimRight's span validation addresses this directly.

**Step 1 — Retrieval**

Hybrid search: 70% cosine similarity (pgvector HNSW) + 30% BM25-style full-text (PostgreSQL `ts_rank`). Top 10 chunks retrieved, Tier 1 regulatory chunks boosted by +0.05, top 3 returned. Minimum threshold: 0.65. Queries are expanded with a synonym table (`lib/synonyms.ts`) before embedding. If nothing scores above 0.65, no letter is generated for that topic.

PostgREST does not support pgvector operators directly. All vector queries go through a PostgreSQL RPC function (`match_kb_chunks`) called via Supabase's `rpc()`.

**Step 2 — Generation (RAG)**

Claude Sonnet 4.6 receives the top 3 chunks plus the extracted case facts. The system prompt requires every factual claim to cite a chunk ID inline. The model is instructed that every `citation.snippet` must be a verbatim quote from the provided chunk text.

**Step 3 — Span validation**

For each inline citation in the output, compute the token overlap coefficient between the citation snippet and the source chunk text (stopwords removed):

```
overlap = |intersection(snippet_tokens, chunk_tokens)| / min(|snippet_tokens|, |chunk_tokens|)
```

**Step 4 — Threshold filtering**

| Score | Action |
|---|---|
| ≥ 0.70 | Pass — include as-is |
| 0.40–0.69 | Flag — soften language ("may not comply with" instead of "violates") |
| < 0.40, chunk_id real | Soften (post-payment: user paid, we don't punch holes) |
| chunk_id not in retrieved set | Remove sentence entirely (true hallucination) |

**Step 5 — Hard minimums (post-payment)**

Every delivered letter must have ≥ 400 words and ≥ 3 valid citations. If the validated output falls short, a category-specific procedural baseline paragraph is appended (up to 5 times) using `prompts/category-baselines.ts`.

**Step 6 — KB miss handling**

If no chunk retrieves above 0.65 for a topic, the system inserts: "Note: We were unable to find a specific regulation for this point. We recommend consulting an insurance advisor for this aspect." That topic is logged as a KB gap.

---

## Project structure

```
app/
  page.tsx                   Landing page
  upload/page.tsx            Upload rejection letter
  analysis/[caseId]/page.tsx Fightability Score + teaser
  pay/[caseId]/page.tsx      Razorpay payment
  download/[caseId]/page.tsx Download PDF + next steps

  api/
    upload/route.ts          Upload to Supabase Storage
    analyse/route.ts         OCR → extraction → retrieval → scoring
    generate/route.ts        Dispute letter generation (post-payment)
    payment/route.ts         Razorpay order creation
    payment/verify/route.ts  Razorpay payment verification
    webhooks/razorpay/route.ts Webhook handler
    kb/ingest/route.ts       KB ingestion (admin only)

lib/
  claude.ts       Anthropic client (haiku + sonnet instances)
  voyage.ts       Voyage AI embedding client
  supabase.ts     Supabase client (browser + server)
  retrieval.ts    Hybrid search + synonym expansion + reranking
  generation.ts   RAG letter generation + span validation
  scoring.ts      Fightability score calculation
  ocr.ts          Document extraction (Claude Haiku Vision)
  pdf.ts          PDF generation
  email.ts        Resend email delivery
  rate-limit.ts   Upstash Redis rate limiter
  synonyms.ts     Query synonym expansion table

prompts/
  extraction.ts          Haiku extraction system prompt
  scoring.ts             Haiku scoring system prompt
  generation.ts          Sonnet generation system prompt
  category-baselines.ts  Per-category fallback paragraphs

scripts/
  ingest-irdai.ts        Chunk + embed IRDAI circulars
  ingest-awards.ts       Chunk + embed ombudsman awards
  ingest-md.ts           Ingest markdown KB sources
  validate-kb.ts         Check KB coverage by rejection category
  diagnose-retrieval.ts  Debug retrieval quality

types/
  case.ts   Case schema types
  kb.ts     KB chunk + search result types
  api.ts    API request/response types
```

---

## Local setup

**Prerequisites:** Node 18+, a Supabase project with `pgvector` enabled, API keys for Voyage AI, Anthropic, Razorpay, Resend, and Upstash Redis.

```bash
git clone https://github.com/asherelginrolls/ClaimRightV.1
cd ClaimRightV.1
npm install
cp .env.example .env.local
# fill in .env.local — see below
npm run dev
```

Open http://localhost:3000.



*
## Knowledge base

The KB is what makes the dispute letters defensible. All sources are official government and regulatory documents.

**Tier 1 — Regulatory (highest authority)**
- IRDAI Master Circular on Health Insurance (29.05.2024)
- PPOI Master Circular (05.09.2024)
- Insurance Ombudsman Rules 2017
- Consumer Protection Act 2019 (relevant sections)

**Tier 2 — Precedent**
- Published Insurance Ombudsman awards (cioins.co.in/decisions)
- NCDRC orders (ncdrc.nic.in)

Chunks: 400 tokens, 50-token overlap. Each chunk requires `tier`, `source_title`, `section_number`, `date`, `circular_number`, `issuer`, and `url` fields. A chunk without complete metadata is not ingested.

---

## Rejection categories

The pipeline maps every rejection to one of 9 categories:

| Code | Label | Default fightability |
|---|---|---|
| `pre_existing_condition` | Pre-existing Condition | Strong if policy > 60 months (PPOI moratorium) |
| `policy_exclusion` | Policy Exclusion | Low–Medium |
| `documentation_incomplete` | Documentation Incomplete | Strong (IRDAI prohibits piecemeal document requests) |
| `non_disclosure` | Non-disclosure | Low unless moratorium passed |
| `waiting_period` | Waiting Period | Strong if waiting period has passed |
| `cashless_denial` | Cashless Denial | Strong (IRDAI: 1hr pre-auth, 3hr discharge auth) |
| `experimental_treatment` | Experimental Treatment | Medium |
| `fraud_suspected` | Fraud Suspected | Low |
| `other` | Other | Varies |

---



---

## Deployment

The `main` branch auto-deploys to Vercel on push. Environment variables are set in the Vercel project dashboard. No build configuration is needed beyond what's in `next.config.ts`.
