# ClaimRight — Technical Source of Truth
**Last updated: May 2026 | Read this file completely before writing a single line of code.**

---

## WHAT IS CLAIMRIGHT

ClaimRight is an AI-powered health insurance dispute co-pilot for India. A user uploads their rejection letter. The system reads it, extracts structured facts, searches a curated knowledge base of IRDAI regulations and ombudsman awards, generates a Fightability Score with real citations, and produces a downloadable dispute letter PDF backed by verified sources.

**This is not a services company. It is a productized AI platform.**

The core trust guarantee: every legal claim in every dispute letter traces to a real, verified source document. If the KB doesn't have it, ClaimRight doesn't claim it. No fabrication. Ever.

---

## CRITICAL DIRECTIVE: HEALTH INSURANCE ONLY

Per co-founder Dr. B. Gopinath's explicit direction: **DO NOT** build for, discuss, or plan motor insurance, consumer disputes, or any vertical expansion. Health insurance is a ₹26,000 Cr rejected claims market. It is large enough. Any scope creep into other verticals signals lack of conviction and will be cut immediately.

---

## TEAM

**Asher Elgin — Founder, GTM & Product**
- Non-technical. Uses Claude Code via the Claude desktop app (Cowork), not a terminal.
- Built PARIKSHE YouTube channel 1K → 100K subscribers organically in 6 months (political marketing)
- Personal experience: mother's health insurance claim rejected by [insurer] after 90-day delay; she got it overturned
- Marketing-focused, domain researcher, GTM executor
- Based in the US on OPT (until September; STEM extension possible with company sponsorship)

**Dr. B. Gopinath — Co-Founder, Technical Advisor**
- 82 years old. PhD Stanford EE (1967). IEEE Life Fellow. 30+ US patents. 100+ publications.
- 20+ years AT&T Bell Labs. Professor at UC Berkeley and Rutgers.
- Created the Gopinath Observer algorithm (embedded in millions of devices globally).
- Founded Lotus Interworks → exits including Cisco acquisition. Founded Simplia (conversational AI marketplace, 2009).
- Started a similar insurance company in 2001 — got killed by insurer lobbying in 2002. Knows the adversarial landscape firsthand.
- Currently based in Los Angeles, CA. Website: gopi.ai.
- **Mathematician. Demands bottoms-up numbers, not top-down estimates. Never estimates — builds from the ground up.**

---

## KEY MARKET DATA (VERIFIED)

All figures sourced from official IRDAI and government data:

- ₹26,037 Cr in rejected/disallowed health insurance claims in FY2023-24 (IRDAI Annual Report FY24, Lok Sabha data via Moneylife)
- 19.10% YoY increase in rejections
- 11% overall denial rate across all health claims
- Less than 1% of rejected claimants formally dispute their rejection
- When they do dispute formally, win rates are high — the ombudsman resolved 94.5% of complaints in FY2023-24 (52,575 cases)
- Average health insurance claim value: ~₹35,000 (all claims); ~₹70,000–75,000 for disputed/hospitalization claims
- Insurance Samadhan (main competitor): 104-person service company, ₹999 + 18% success fee, 5–7% acceptance rate, ~2,000–3,000 resolved cases/year, ₹6.21 Cr revenue FY2025, ₹137 Cr valuation, North India focus, handles Life+Health+General

**NOTE: Do NOT use "87% win rate" language anywhere in the product or codebase. The 87% figure in older research referred to cases disposed of within 90 days (speed metric), not policyholder win rate. Use "94.5% ombudsman resolution rate" (the verified figure) instead.**

---

## DISPUTE ESCALATION PROCESS (India)

Users go through these stages in order:

1. **GRO (Insurer Grievance Redressal Officer)** — File within 15 days. Insurer must respond within 15 days.
2. **IGMS / Bima Bharosa (IRDAI portal)** — File at bimabharosa.irdai.gov.in if GRO fails. Insurer response window: 15 days.
3. **Insurance Ombudsman (CIO)** — FREE. No lawyers allowed. 94.5% resolution rate. Max claim: ₹50L. Window: 1 year from insurer's final rejection.
4. **Consumer Court** — Last resort. Lawyer typically required. 6–18 months. 2-year limitation period.

**CRITICAL LEGAL CONSTRAINT**: IGMS and Ombudsman filing must be done by the policyholder directly. ClaimRight's legal model is "Assisted Filing" — ClaimRight drafts all content, user submits themselves. We do NOT file on anyone's behalf via POA for IGMS/Ombudsman because IRDAI explicitly prohibits third-party IGMS filing and the CIO Rules 2017 prohibit legal representatives appearing before the ombudsman.

---

## KEY IRDAI REGULATIONS (already verified, cite these exactly)

**Master Circular on Health Insurance (29.05.2024):**
- Cashless pre-authorization: insurer must decide within 1 hour
- Discharge authorization: insurer must decide within 3 hours
- Reimbursement settlement: insurer must pay within 30 days
- Interest: 2% per month on delayed settlements
- Piecemeal document requests are prohibited — insurer must request all documents at once

**PPOI Master Circular (05.09.2024):**
- 30-day free look period for new policies
- 60-month moratorium on pre-existing disease non-disclosure — after 60 months, PED cannot be cited as grounds for rejection
- Claim rejection requires PMC (Policy Management Committee) or CRC (Claims Review Committee) review

**Insurance Ombudsman Rules 2017:**
- ₹5,000/day penalty for non-compliance with ombudsman awards within 30 days
- No legal representative allowed before ombudsman

---

## THIS PROJECT IS STARTING FROM ZERO

There is no existing codebase for ClaimRight. This folder (`claimright-code/`) is the beginning. Do not reference or import code from anywhere else in the parent folder. The only things that exist and are useful references:
- `../landing.html` — A landing page with design elements, copywriting, and a rules-based fightability calculator. Reference it for design language, colors, and copy only. Do not copy its JavaScript or form handlers directly — they have bugs.
- `../research/` — Research documents with verified facts, market data, and architecture decisions.

**No API keys have been set up yet.** Every session prompt will specify exactly which API key to obtain before running that session. Do not assume any key exists.

---

## MVP SCOPE — 5 SCREENS ONLY

This is the MVP. The smallest thing that proves people will upload a rejection letter and pay ₹99 for a dispute letter. Nothing else.

### SCREEN 1: Landing Page
- Headline: "Got your health insurance claim rejected? Find out if you can fight it."
- Single CTA: "Upload Your Rejection Letter"
- Trust signals: "Based on IRDAI regulations" + stat from the ombudsman
- No login, no signup, no friction

### SCREEN 2: Upload
- Upload rejection letter PDF or image (JPG/PNG)
- Optional: upload policy document
- Email field (to send them the dispute letter later)
- Privacy notice: "Do not include Aadhaar number, phone number, or policy number. Text is analyzed and not stored."

### SCREEN 3: Analysis Results
- Fightability Score: Low / Medium / Strong (with color coding)
- 2–3 bullet points citing real regulations
- Example: "IRDAI Master Circular §5.7 prohibits piecemeal document requests. Your insurer sent 3 separate document demands."
- Claim amount and insurer name extracted from their letter, displayed back to them
- CTA: "Get Your Dispute Letter — ₹99"

### SCREEN 4: Payment
- Razorpay payment button (UPI + card + netbanking)
- What they get: one paragraph description
- ₹99 flat. No success fee for MVP.

### SCREEN 5: Download / Delivery
- Download dispute letter PDF
- PDF also emailed to them
- "What to do next" — 3 plain-English steps

### EXPLICITLY OUT OF SCOPE FOR THIS MVP
- No login or auth system (email field only)
- No user dashboard or case tracker
- No milestone tracker
- No WhatsApp automation
- No HITL admin panel
- No multi-stage escalation packs
- No questionnaire fallback (PDF/image upload only — no text paste input on the front end)
- No ombudsman filing guide
- No success fee tier (comes after MVP proves demand)
- No insurer-specific templates
- No analytics dashboard
- No mobile app
- No A/B testing
- No blog or content section

---

## ANTI-HALLUCINATION PIPELINE — NON-NEGOTIABLE ARCHITECTURE

**Why this matters:** DoNotPay was fined $193,000 by the FTC in 2025 for making AI legal claims it couldn't substantiate. Stanford HAI (2024) found legal AI hallucinates in 1 out of 6+ queries even when citations are present — because models post-hoc assign citations that don't actually support the claim. ClaimRight's span validation directly addresses this.

Every sentence in a ClaimRight dispute letter must be grounded in the KB before being included. This pipeline is not optional and cannot be simplified away.

### STEP 1 — RETRIEVAL
- Query the KB using the rejection reason + insurer name + claim type
- Retrieve top 10 most similar chunks using hybrid search (vector cosine similarity + Postgres full-text search, weighted 70/30)
- Re-rank the top 10 → return top 3
- **Minimum similarity threshold: 0.65.** If nothing scores above 0.65 on a topic, do NOT generate a legal claim about that topic.

### STEP 2 — GENERATION (RAG)
- LLM (Claude Sonnet 4.6) receives: [top 3 retrieved chunks] + [extracted case facts] + [system prompt]
- System prompt instructs: "Use ONLY the provided source documents. Cite every factual claim inline. Never infer regulations not present in the provided documents. Do not hallucinate chunk IDs. Every citation.snippet must be a verbatim quote from the provided chunk text."
- Output: draft dispute letter with inline citations like `[Source: IRDAI Master Circular 29.05.2024, §5.7]`

### STEP 3 — SPAN VALIDATION
- For each inline citation in the output:
  - Find the cited source chunk in the retrieved set
  - Compute token overlap coefficient between the claim text and the source chunk text (stopwords removed)
  - Score: 0.0 to 1.0

### STEP 4 — THRESHOLD FILTERING
- Score ≥ 0.70 → **PASS** — include in letter as-is
- Score 0.40–0.69 → **FLAG** — soften language ("may" / "appears to") + add disclaimer
- Score < 0.40 → **FAIL** — remove sentence entirely, log as hallucination candidate

### STEP 5 — KB MISS HANDLING
- If no chunk retrieves above 0.65 for a topic, the system MUST:
  - NOT generate any text on that topic
  - Insert: "Note: We were unable to find a specific regulation for this point. We recommend consulting an insurance advisor for this aspect."
  - Log this as a KB gap

### OUTPUT
- Every paragraph in the dispute letter ends with its source citation in brackets
- PDF footer reads: "This letter is based on verified IRDAI regulations and ombudsman precedents. All citations are sourced from official IRDAI circulars. This is not legal advice."

---

## KNOWLEDGE BASE STRUCTURE

The KB is what makes ClaimRight defensible. It must be populated before the product goes live.

### Tier 1 — Regulatory Layer (highest authority)
- IRDAI Master Circular on Health Insurance (29.05.2024) — download from irdai.gov.in
- PPOI Master Circular (05.09.2024) — download from irdai.gov.in
- Insurance Ombudsman Rules 2017 — download from cioins.co.in
- Consumer Protection Act 2019 (relevant sections) — download from legislative.gov.in

### Tier 2 — Precedent Layer
- Published ombudsman awards — cioins.co.in/decisions
- NCDRC orders — ncdrc.nic.in
- Each award structured as: case_id, insurer, rejection_reason, decision_date, outcome, key_holding

### NOT IN KB (explicitly excluded)
- News articles
- Insurance advisor blogs
- Reddit / forum posts
- Any source that cannot be traced to an official government or regulatory body

### Chunking Rules
- Chunk size: 400 tokens with 50-token overlap
- Metadata required per chunk: tier (1/2/3), source_title, section_number, date, circular_number, issuer, url
- **A chunk without complete metadata must NOT be ingested**

---

## TECH STACK (ALL DECISIONS FINAL)

### Frontend + Hosting
**Next.js 14 (App Router) + Tailwind CSS, deployed on Vercel (free tier)**
- Why: Industry standard, Claude Code is excellent at it, Vercel auto-deploys on push with zero config, free tier covers MVP traffic (100GB bandwidth/month)
- Cost: Free

### Database + Vector Search + Storage
**Supabase (PostgreSQL + pgvector extension + file storage)**
- Why: One service handles relational DB, vector embeddings, and file storage — no separate vector DB subscription, no extra services, no extra bills
- pgvector with HNSW indexes handles our KB size (<100K chunks) at 5–8ms query latency
- **Important implementation detail**: PostgREST (Supabase's API layer) does NOT support pgvector similarity operators directly. All vector search queries MUST be wrapped in a PostgreSQL function and called via Supabase's `rpc()` method. Claude Code will implement this correctly — session prompts include the exact SQL.
- Cost: Free tier (500MB DB, 1GB storage) — sufficient for MVP

### Embeddings
**Voyage AI — model: `voyage-law-2`**
- Why: Specifically fine-tuned for legal document retrieval. 1024 dimensions, 16,000 token context. Outperforms OpenAI text-embedding-3-large on legal retrieval benchmarks.
- The KB is all English legal content (IRDAI circulars, ombudsman awards in English). Hindi documents are handled by Sarvam OCR upstream which extracts text that gets embedded in English.
- API: voyageai.com — sign up, get API key
- Cost: 200M free tokens. Our entire KB ingestion + months of queries won't touch this.
- npm package: `voyageai`

### OCR
**Dual routing:**
- If document contains >20% non-ASCII characters → **Sarvam Vision API** (84.3% accuracy on Indian documents, 22 Indian languages + English)
- Otherwise → **Claude Haiku 4.5 Vision** (send PDF pages as base64 images)
- Cost: Sarvam has free tier. Claude Haiku Vision costs ~₹15–20 per case.

### LLM — Extraction and Scoring
**Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)**
- Why: Fast, cheap, excellent at structured JSON extraction
- Used for: OCR fact extraction, rejection reason classification, fightability score calculation
- Cost: ~₹15–20 per case

### LLM — Dispute Letter Drafting
**Claude Sonnet 4.6 (`claude-sonnet-4-6`)**
- Why: Higher quality reasoning, better citation enforcement, more reliable instruction-following for the citation-gated pipeline
- Used ONLY after user pays (post-payment gate)
- Cost: ~₹60–65 per case

### Total Variable Cost Per Case
~₹82/case at 1,000 cases/month. Revenue: ₹99/case (MVP price). Gross margin ~17% at MVP price — this is intentionally thin; the goal is volume and proof of concept, not margin. Success fee model (Gopi's preferred pricing: ₹199 + tiered 5%/10% success fee) activates post-MVP when we have case volume.

### Payments
**Razorpay**
- Why: India-native, supports UPI + card + netbanking, 2% per transaction, widely trusted
- Requires KYC — Asher must complete this himself (cannot be automated)
- Cost: 2% per transaction only, no monthly fee

### PDF Generation
**`pdf-lib` or Puppeteer (via Vercel serverless function)**
- Why: Free, runs in Vercel serverless, generates clean PDFs from HTML templates
- Cost: Free

### Email Delivery
**Resend (resend.com)**
- Why: 3,000 free emails/month on free tier, clean API, works great with Next.js
- Cost: Free for MVP

---

## ENVIRONMENT VARIABLES

All in `.env.local`. Never commit to git. `.env.example` (no real values) is committed.

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

**API SETUP STATUS**: None of these have been set up yet. Each Claude Code session prompt will tell you exactly which keys you need for that session, where to sign up, and how to add them to Vercel.

---

## DATABASE SCHEMA (Supabase)

### Table: `cases`
```sql
CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT,
  status TEXT CHECK (status IN ('uploaded', 'analysed', 'paid', 'generated', 'delivered')) DEFAULT 'uploaded',
  insurer TEXT,
  claim_amount INTEGER, -- stored in paise (1 rupee = 100 paise)
  rejection_reason_raw TEXT,
  rejection_reason_category TEXT CHECK (rejection_reason_category IN (
    'pre_existing_condition', 'policy_exclusion', 'documentation_incomplete',
    'non_disclosure', 'waiting_period', 'cashless_denial',
    'experimental_treatment', 'fraud_suspected', 'other'
  )),
  rejection_date DATE,
  fightability_score TEXT CHECK (fightability_score IN ('low', 'medium', 'strong')),
  fightability_reasons JSONB, -- array of {reason: string, citation: string|null}
  document_path TEXT, -- Supabase Storage path
  letter_path TEXT, -- path to generated dispute letter PDF
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  paid_at TIMESTAMPTZ
);
```

### Table: `kb_chunks`
```sql
-- Enable pgvector first
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tier INTEGER CHECK (tier IN (1, 2, 3)),
  source_title TEXT NOT NULL,
  section_number TEXT,
  date DATE,
  circular_number TEXT,
  issuer TEXT NOT NULL, -- e.g. "IRDAI", "Insurance Ombudsman", "NCDRC"
  url TEXT,
  content TEXT NOT NULL, -- the chunk text (400 tokens)
  embedding VECTOR(1024), -- voyage-law-2 outputs 1024 dimensions
  fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

-- HNSW index for fast vector search
CREATE INDEX ON kb_chunks USING hnsw (embedding vector_cosine_ops);

-- Full-text search index
CREATE INDEX ON kb_chunks USING GIN (fts);
```

### PostgreSQL Function for Hybrid Search (required — PostgREST cannot do vector ops directly)
```sql
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
    -- Hybrid score: 70% vector similarity + 30% BM25-style full-text
    (0.7 * (1 - (kc.embedding <=> query_embedding))) +
    (0.3 * ts_rank(kc.fts, plainto_tsquery('english', query_text))) AS similarity
  FROM kb_chunks kc
  WHERE
    (1 - (kc.embedding <=> query_embedding)) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
```

### Row Level Security (RLS)
RLS must be enabled on both tables. Cases table: users can only read their own cases (by session/email). KB chunks: public read, service-role-only write.

---

## FOLDER STRUCTURE

```
/claimright-code
├── /app                                    ← Next.js App Router pages
│   ├── page.tsx                            ← Screen 1: Landing page
│   ├── /upload
│   │   └── page.tsx                        ← Screen 2: Upload
│   ├── /analysis
│   │   └── [caseId]
│   │       └── page.tsx                    ← Screen 3: Analysis results
│   ├── /pay
│   │   └── [caseId]
│   │       └── page.tsx                    ← Screen 4: Payment
│   ├── /download
│   │   └── [caseId]
│   │       └── page.tsx                    ← Screen 5: Download/delivery
│   └── /api
│       ├── /upload
│       │   └── route.ts                    ← Handle PDF upload → Supabase Storage
│       ├── /analyse
│       │   └── route.ts                    ← OCR + extraction + retrieval + scoring
│       ├── /generate
│       │   └── route.ts                    ← Dispute letter generation (post-payment)
│       ├── /payment
│       │   └── route.ts                    ← Razorpay order creation
│       ├── /payment
│       │   └── /verify
│       │       └── route.ts                ← Razorpay webhook verification
│       └── /kb
│           └── /ingest
│               └── route.ts               ← KB ingestion (admin only, protected)
├── /lib                                    ← Shared utilities
│   ├── supabase.ts                         ← Supabase client (client + server)
│   ├── voyage.ts                           ← Voyage AI embedding client
│   ├── claude.ts                           ← Anthropic API client
│   ├── sarvam.ts                           ← Sarvam Vision OCR client
│   ├── ocr.ts                              ← OCR routing logic
│   ├── retrieval.ts                        ← Hybrid search + reranking
│   ├── scoring.ts                          ← Fightability score calculation
│   ├── generation.ts                       ← Dispute letter + span validation
│   └── pdf.ts                              ← PDF generation
├── /types
│   ├── case.ts                             ← Case schema types
│   ├── kb.ts                               ← KB chunk schema types
│   └── api.ts                              ← API response types
├── /scripts                                ← Run manually to build KB
│   ├── ingest-irdai.ts                     ← Chunk + embed IRDAI circulars
│   ├── ingest-awards.ts                    ← Chunk + embed ombudsman awards
│   └── validate-kb.ts                      ← Check KB coverage
├── /prompts                                ← LLM system prompts (versioned here)
│   ├── extraction.ts                       ← Haiku extraction system prompt
│   ├── scoring.ts                          ← Haiku scoring system prompt
│   └── generation.ts                       ← Sonnet generation system prompt
├── CLAUDE.md                               ← This file
├── .env.local                              ← NEVER commit
├── .env.example                            ← Commit this (no real values)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## 9 CANONICAL REJECTION REASON CATEGORIES

All extraction must map to exactly one of these. No exceptions.

| Code | Label | Description | Typical Fightability |
|------|-------|-------------|----------------------|
| `pre_existing_condition` | Pre-existing Condition | Insurer claims condition existed before policy start | Depends on moratorium (60 months = STRONG) |
| `policy_exclusion` | Policy Exclusion | Insurer invokes a specific policy exclusion clause | Low–Medium (depends on clause clarity) |
| `documentation_incomplete` | Documentation Incomplete | Missing documents — often a stalling tactic | STRONG (IRDAI prohibits piecemeal requests) |
| `non_disclosure` | Non-disclosure | Insurer alleges material non-disclosure at purchase | Low unless moratorium passed |
| `waiting_period` | Waiting Period | Treatment falls within waiting period | Strong if waiting period has passed |
| `cashless_denial` | Cashless Denial | Cashless authorization denied | Strong (IRDAI: 1hr/3hr pre-auth rules) |
| `experimental_treatment` | Experimental Treatment | Treatment deemed experimental/non-standard | Medium (treating doctor cert often overturns) |
| `fraud_suspected` | Fraud Suspected | Insurer suspects fraud | Low — different handling needed |
| `other` | Other | Doesn't fit above categories | Varies |

---

## FIGHTABILITY SCORING LOGIC (MVP — Rules-Based, Not ML)

**Output**: `fightability_score: 'low' | 'medium' | 'strong'` + `fightability_reasons` array (max 3 items, each with `reason` string + `citation` string or null)

**Scoring Rules (apply top-down; Strong overrides Medium overrides Low):**

### STRONG if ANY of:
- KB retrieval returned a regulation match with similarity ≥ 0.80 (clear IRDAI violation)
- Insurer sent 2+ separate document requests for same claim (piecemeal = IRDAI violation)
- Insurer took >30 days to settle a reimbursement claim OR >1hr/3hr for cashless pre-auth
- Ombudsman precedent found for same rejection reason AND same or similar insurer
- Rejection reason is `documentation_incomplete` (overwhelmingly overturned at ombudsman)
- Rejection reason is `pre_existing_condition` AND policy is >60 months old (PPOI moratorium)
- Rejection reason is `cashless_denial` (IRDAI 1hr/3hr rule gives clear grounds)

### MEDIUM if ANY of:
- KB retrieval returned a regulation match with similarity 0.65–0.79
- Ombudsman precedent found (different insurer, same rejection reason)
- Rejection reason is `waiting_period` and timing is unclear
- Days since rejection > 7 but < 30 (still fully within GRO window)

### LOW if:
- Rejection reason is `fraud_suspected` (cannot help effectively in MVP)
- No KB match found (similarity < 0.65) on any aspect
- Policy exclusion is clear, unambiguous, and directly applicable
- Rejection reason is `non_disclosure` with less than 60 months of policy age

---

## CODING RULES (NON-NEGOTIABLE)

1. **TypeScript only.** No `.js` files except config files (`next.config.ts`, `tailwind.config.ts`).
2. **No `any` types.** All types must be explicit. Use generics where needed.
3. **All API responses validated with Zod at runtime.** No unvalidated external data.
4. **All external API calls (Claude, Voyage, Sarvam, Razorpay) must have try/catch + timeout + fallback.**
5. **Never commit secrets.** All keys in `.env.local` only. The `.env.example` has all keys with empty values.
6. **Every LLM call must have a timeout** (30 seconds max) and a graceful error response.
7. **The citation-gated pipeline is not optional.** Do not simplify it, bypass it, or add a "skip validation" flag.
8. **Supabase Row Level Security (RLS) must be enabled** on all tables before any data is stored.
9. **All user-uploaded files stored in Supabase Storage with UUID paths** — never the original filename.
10. **PII handling**: Strip or anonymize patient name and phone number from all extracted facts before storing. Store only case data needed for dispute generation. No Aadhaar numbers anywhere.
11. **Rate limiting on all public API routes**: 5 requests per IP per minute using a simple in-memory store. Prevents API cost abuse.
12. **Clean TypeScript compile required**: Every session ends with `npx tsc --noEmit` returning 0 errors.

---

## DESIGN SYSTEM (Reference Only — Do Not Copy Code)

The file at `../landing.html` has good design language but code bugs. Reference it for:
- Color palette: deep navy (`#0f1f2e`), white, accent green (`#1f3b2a`)
- Typography: DM Serif Display (headings), DM Sans (body), JetBrains Mono (code/citations)
- Component patterns: trust strips, score badges, citation pills
- Copy: hero headline, stats strip, trust signals

Do NOT import or copy any JavaScript from `landing.html`. Rebuild all interactive elements in React.

---

## SERVICES TO SIGN UP FOR (ASHER DOES THESE — NOT CLAUDE CODE)

You have not set up any of these yet. Each Claude Code session will tell you exactly which ones to set up for that session. Do not set them all up at once — do them as you get to each session.

| # | Service | URL | What you'll get | When to do it |
|---|---------|-----|-----------------|---------------|
| 1 | Supabase | supabase.com | Project URL + anon key + service role key | Before Session 1 |
| 2 | Voyage AI | voyageai.com | API key (200M free tokens) | Before Session 2 |
| 3 | Anthropic API | console.anthropic.com | API key (separate from Claude subscription) | Before Session 3 |
| 4 | Sarvam AI | sarvam.ai | API key (free credits) | Before Session 3 |
| 5 | Razorpay | razorpay.com | Key ID + Key Secret (requires KYC — do it early) | Before Session 7 |
| 6 | Resend | resend.com | API key (3,000 free emails/month) | Before Session 7 |
| 7 | Vercel | vercel.com | Free account (connect GitHub repo) | Before Session 8 |
| 8 | Domain | Cloudflare or Namecheap | claimright.in (~₹800/yr) | Whenever, needed for Session 8 |

**Razorpay KYC takes 2–7 business days. Start it early (ideally before Session 5 so it's ready by Session 7).**

---

## HOW ASHER USES CLAUDE CODE

- Claude Code is accessed through the Claude desktop app (Cowork mode), not the terminal
- Each session is a separate conversation. Paste the session prompt, let Claude Code run
- No terminal commands needed. Claude Code does everything.
- Verify each session by following the VERIFICATION section at the end of each session prompt
- When starting a new session, Claude Code reads CLAUDE.md first — it has all the context

---

## INSTRUCTIONS FOR CLAUDE CODE IN EVERY SESSION

1. **Read this CLAUDE.md completely before writing a single line of code**
2. Check the session prompt for which API keys are needed — do not proceed if keys are missing from `.env.local`
3. Follow the folder structure exactly as defined in this file
4. All TypeScript must compile clean (`npx tsc --noEmit`) before the session is considered done
5. The citation-gated pipeline in `generation.ts` is sacred — do not simplify it
6. The similarity threshold of 0.65 is a floor — never lower it
7. End every session by running the verification steps listed at the bottom of the session prompt
