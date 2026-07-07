# Ashray — Technical Source of Truth (V4)
**Last updated: July 2026. Read this file completely before writing any code.**

> Supersedes CLAUDE.md V1, CLAUDE_PART2.md (V2), and CLAUDE_V3.md — all archived in
> `docs/archive/`. This file reflects the July 2026 one-shot build: the Ashray rebrand,
> the REASON→GROUND→VALIDATE pipeline, accounts + case vault, and the multi-stage
> dispute engine.

---

## 1. WHAT IS ASHRAY

Ashray (आश्रय — "shelter/refuge", formerly ClaimRight) is an AI health-insurance
dispute co-pilot for India. A user uploads their rejection letter. The system reads it,
extracts structured facts, reasons about the strongest legal angles, grounds each angle
in a curated knowledge base of IRDAI regulations and ombudsman awards, produces a
Fightability Score with real citations, generates a source-backed Dispute Pack, and
then walks the user through filing it — escalating stage by stage (GRO → Bima Bharosa →
Ombudsman) until they win or exhaust the ladder.

**Core trust guarantee:** every legal claim in every letter traces to a real, verified
source. If the KB doesn't have it, Ashray doesn't assert it as law — it labels it a
general principle instead. No fabricated regulations, dates, section numbers, case IDs,
or precedents. Ever. (DoNotPay: $193K FTC fine, 2025. Stanford HAI: legal AI
hallucinates 1 in 6+ queries even with citations.)

### CRITICAL DIRECTIVE: HEALTH INSURANCE ONLY
Per co-founder Dr. B. Gopinath: no motor, life, consumer, or any other vertical. Ever.

---

## 2. TEAM (context for tone & decisions)

**Asher Elgin — Founder, GTM & Product.** Non-technical; uses Claude Code via the
Claude desktop app (Cowork), not a terminal. US-based on OPT. Personal motivation:
mother's claim rejected after a 90-day delay, then overturned.

**Dr. B. Gopinath — Co-Founder, Technical Advisor.** 82. PhD Stanford EE. IEEE Life
Fellow. Bell Labs 20+ yrs. Ran a similar insurance company in 2001, killed by insurer
lobbying. **Mathematician: demands bottoms-up numbers, never top-down estimates.**

---

## 3. KEY MARKET DATA (verified — cite exactly)

- ₹26,037 Cr rejected/disallowed health claims FY2023-24 (IRDAI Annual Report; Lok
  Sabha data via Moneylife). 19.10% YoY increase. ~11% denial rate.
- <1% of rejected claimants formally dispute.
- Ombudsman resolved **94.5%** of complaints FY2023-24 (52,575 cases). **Use "94.5%
  ombudsman resolution rate" — NEVER "87% win rate"** (87% was a speed metric).
- Avg health claim ~₹35,000; disputed/hospitalization ~₹70,000–75,000.
- Competitor **Insurance Samadhan**: 104-person service company, ₹999 + 18% success
  fee, 5–7% acceptance rate, ~2,000–3,000 cases/yr, ₹6.21 Cr revenue FY2025.

---

## 4. ESCALATION LADDER & LEGAL CONSTRAINT

1. **GRO** (insurer Grievance Redressal Officer) — file within 15 days; insurer
   responds within 15 days.
2. **IGMS / Bima Bharosa** (bimabharosa.irdai.gov.in) — if GRO fails; 15-day window.
3. **Insurance Ombudsman (CIO)** — FREE, no lawyers, 94.5% resolution, max ₹50L, file
   within 1 year of final rejection.
4. **Consumer Court** — last resort; guidance/handoff only, never automated.

**LEGAL MODEL = "Assisted Filing."** Ashray drafts every field and walks the user
through the portal; the policyholder submits themselves. IRDAI prohibits third-party
IGMS filing; CIO Rules 2017 prohibit representatives before the ombudsman. Never build
server-side automation that logs into or submits on government portals. Surface this as
a trust feature: "we prepare everything; you stay in control and submit — that's the
law, and it protects you."

---

## 5. KEY IRDAI REGULATIONS (verified — cite exactly)

**Master Circular on Health Insurance (29.05.2024):** cashless pre-auth decision within
**1 hour**; discharge authorization within **3 hours** (delay costs borne by insurer's
shareholders' fund); **insurer/TPA must collect claim documents from the hospital —
"Policyholder shall not be required to submit the documents"**; no repudiation without
PMC/CRC approval; ombudsman awards must be implemented within 30 days (₹5,000/day
penalty).

**⚠️ Corrected July 2026:** delay interest is **"bank rate plus 2 percent", suo-moto**
(PPOI Master Circular TAT provisions) — NOT "2% per month". The 2%/month figure was a
fabrication that leaked in via the synthetic precedents; never use it. Likewise "no
claim shall be rejected or closed for want of documents or for delayed intimation"
(PPOI MC) is the verbatim ground for documentation cases — stronger than the informal
"piecemeal prohibited" summary.

**PPOI Master Circular (05.09.2024):** 30-day free-look; **60-month moratorium** on
pre-existing-disease non-disclosure (after 60 months PED cannot be cited); rejection
requires PMC/CRC review.

**Insurance Ombudsman Rules 2017:** ₹5,000/day penalty for non-compliance with awards
within 30 days; no legal representative before the ombudsman.

**Standardized exclusions Excl.01–Excl.18** — in the KB with full definitions;
Excl.02 = specified disease/procedure waiting period, with its list plus an explicit
"acute/unlisted conditions are NOT specified diseases under Excl.02" clarifier chunk.

---

## 6. THE 9 CANONICAL REJECTION CATEGORIES & SCORING

| Code | Typical Fightability |
|---|---|
| `pre_existing_condition` | STRONG if policy >60 months (moratorium) |
| `policy_exclusion` | Low–Medium |
| `documentation_incomplete` | STRONG (piecemeal prohibited) |
| `non_disclosure` | Low unless moratorium passed |
| `waiting_period` | Strong if period passed |
| `cashless_denial` | Strong (1hr/3hr rule) |
| `experimental_treatment` | Medium (doctor cert often overturns) |
| `fraud_suspected` | Low — different handling |
| `other` | Varies |

Output: band `low|medium|strong` + numeric 0–100 (strong 65–95, medium 40–64, low
5–39) + up to 3 reasons `{reason, citation|null}`. **STRONG if any:** KB match ≥0.80;
2+ piecemeal doc requests; >30-day reimbursement delay or >1hr/3hr cashless; ombudsman
precedent same reason + similar insurer; `documentation_incomplete`;
`pre_existing_condition` + policy >60mo; `cashless_denial`. **MEDIUM if any:** KB match
0.65–0.79; precedent different insurer same reason; `waiting_period` unclear; 7–30 days
since rejection. **LOW otherwise.**

---

## 7. THE REASONING + GROUNDING PIPELINE (the crown jewel — sacred)

**Order matters: reason first, then ground — never retrieve-then-gag.** Learned from a
real field test (Star Health bursitis case, June 2026) where naive RAG inverted its own
lead argument and conceded the insurer's case.

For both analysis and every letter (`lib/reasoning.ts`):

1. **STRATEGIZE** (Sonnet 4.6, temp 0) — from extracted facts + the category playbook,
   enumerate candidate legal angles from first principles, not yet restricted to KB.
2. **ADVERSARIAL CHECK** (Sonnet 4.6) — for each angle: "would the insurer's own
   reviewer say this helps the claimant, or concedes their point?" Drop or repair every
   concession. (Kills the "9 months < 24-month waiting period" class of error.)
3. **GROUND** — per surviving angle, targeted hybrid retrieval (70% vector cosine via
   voyage-law-2 + 30% Postgres full-text through the `match_kb_chunks` RPC — PostgREST
   can't do pgvector ops directly). Top 10 → Tier-1 boost rerank → top 3.
4. **CLASSIFY** — **VERIFIED** (grounded ≥0.65 in a Tier-1 regulation or real award →
   assert strongly, attach `[Source:]`) vs **GENERAL PRINCIPLE** (model-known, not in
   KB → labeled "general principle — confirm with an advisor", never a fabricated
   citation). Real arguments survive even when the KB lacks them — honestly labeled.
5. **SPAN-VALIDATE** cited claims — verbatim-containment check primary + token-overlap
   coefficient secondary (numeric/§ tokens kept): ≥0.70 PASS; 0.40–0.69 FLAG (soften:
   "may"/"appears to" + disclaimer); <0.40 FAIL.

**Thresholds** (`lib/thresholds.ts` — canonical): retrieve 0.55, **gate 0.65 (floor —
never lower)**, strong 0.80, span 0.70/0.40, post-payment fallback 0.40.

**Pre-payment:** if nothing grounds ≥0.65 on a topic, don't generate on it; insert an
advisor note; log the KB gap.

**POST-PAYMENT GUARANTEE:** once paid, always deliver a complete, formal letter —
≥400 words, ≥3 real inline citations. FAIL spans are SOFTENED, not deleted; a sentence
is deleted ONLY when its citation references a chunk_id not in the retrieved set (true
fabrication). The "consult an advisor" stub is BANNED for paid cases.

**Letter format:** formal Indian legal-correspondence English (no "I feel"/"kindly").
Date → addressee (GRO/IRDAI/Ombudsman per stage) → subject → 3–5 numbered argument
paragraphs each ending in `[Source:]` → fixed "I request" tri-clause (settle in full /
2%-per-month interest / written response within 15 days) → escalation sentence →
sign-off → enclosures reflecting docs actually uploaded → disclaimer footer ("Based on
verified IRDAI regulations and ombudsman precedents… This is not legal advice."). The
tri-clause interest wording is "penal interest at the bank rate plus 2%, suo-moto"
(see §5 correction).

**Do not simplify, bypass, or add a "skip validation" flag. Ever.**

---

## 8. MULTI-STAGE DISPUTE ENGINE (new in V4)

A case is a journey along the escalation ladder, not one letter. Each stage
(`dispute_stages` row) is first-class: its own deadline, artifacts, status, filing
walkthrough.

- **Stages:** `gro → bima_bharosa → ombudsman → consumer_court` (consumer_court =
  static guidance only). Status: `not_started|drafted|filed|awaiting_response|resolved|escalated`.
- **Reuse-vs-rebuild:** at each stage after the first, `lib/stage-policy.ts` decides
  `adapted` vs `rebuilt` (default: rebuild when new facts/docs entered — e.g. the
  insurer's GRO reply — adapt when only the addressee/authority/tone changes). The
  decision + plain-English reason is recorded on the stage row and surfaced to the
  user. Either way the full REASON→GROUND→VALIDATE pipeline re-runs with updated facts.
  The citation bar never drops at higher stages; ungrounded/softened-out claims never
  carry forward.
- **Artifacts** (`stage_artifacts`): grievance_letter, complaint_form,
  statement_of_case, filing_walkthrough, cc_list, evidence_checklist — PDFs/JSON in
  Storage under `documents/{caseId}/stages/{stage}/…`.
- **Bima Bharosa co-pilot:** generates every field's exact text, computes the deadline,
  renders a step-by-step portal walkthrough. Assisted filing only (see §4).
- **₹299 covers all stages of a case.** Stage gating uses `paid_at`, not status.

---

## 9. ACCOUNTS & CASE VAULT (new in V4)

- Supabase Auth email OTP (magic-link/OTP). First analysis stays frictionless —
  anonymous upload works; the case binds to an account at or before payment.
- Binding: upload sets a session cookie → `cases.session_id`; pay page has an inline
  OTP step; `POST /api/cases/[caseId]/claim` binds when `user_id IS NULL AND (session
  match OR email match)`; payment/verify auto-claims.
- `/vault` — all the user's cases. `/vault/[caseId]` — stage timeline, deadline chips,
  document vault grouped by stage, generation-decision card, advance dialog.
- Ownership checks live in API routes (service client + `case.user_id === user.id`);
  middleware only refreshes tokens on `/vault` and `/auth`.

---

## 10. STACK & SCHEMA (decisions final — don't re-litigate)

Next.js 14 (App Router) + Tailwind on Vercel. Supabase (Postgres + pgvector HNSW +
Storage + Auth). Voyage `voyage-law-2` (1024-dim). OCR: Sarvam Vision first for PDFs
(handles Indian languages + English), Claude Haiku 4.5 Vision fallback and for images.
**Runtime models: Haiku 4.5 (`claude-haiku-4-5-20251001`) for OCR + raw extraction;
Sonnet 4.6 (`claude-sonnet-4-6`) for strategize/adversarial/letters. Never Opus or
Fable at runtime** (unit economics — every cost change shown as a bottoms-up per-case
delta). Razorpay (test mode until the live gate passes). pdf-lib. Resend (domain:
claimright.in — do not switch until ashray.in is verified). Upstash Redis rate-limit +
Cloudflare Turnstile (both optional with graceful fallbacks).

**Price: ₹299 flat per case, all stages. Never use "% of claim" or "no success fee"
copy** (a success-fee tier comes later).

### Schema (live + V4 additions)
- `cases`: id, created_at, email, status (`uploaded|analysed|paid|generated|delivered`
  — the funnel state machine; per-stage progress lives in `dispute_stages.status`),
  insurer, claim_amount (paise), rejection_reason_raw/category, rejection_date,
  fightability_score/numeric/reasons, evidence_summaries, point_by_point_analysis,
  document_path, letter_path, razorpay ids, paid_at, **user_id (nullable FK
  auth.users), session_id** (V4).
- `case_documents`: id, case_id, doc_type, storage_path, ocr_text, extracted_facts.
- `kb_chunks`: id, tier (1/2/3), source_title, section_number, date, circular_number,
  issuer, url, content, embedding VECTOR(1024), fts, **authority_type
  (`definition|regulation|precedent`)** (V4). A chunk without complete metadata is NOT
  ingested; chunks with date/citation contradictions are excluded from retrieval.
- **`dispute_stages`** (V4): id, case_id, stage, status, deadline_date, filed_at,
  generation_decision (`adapted|rebuilt`), generation_reason, generation_started_at,
  UNIQUE(case_id, stage).
- **`stage_artifacts`** (V4): id, stage_id, artifact_type, storage_path, generated_at.
- `match_kb_chunks(query_embedding, query_text, match_threshold, match_count)` RPC —
  similarity = `0.7*(1-cosine) + 0.3*ts_rank`.
- RLS on every table. Migrations in `supabase/migrations/` — **Claude Code never runs
  them; Asher pastes them into Supabase Studio.**

### Coding rules (non-negotiable)
TypeScript only; no `any`; Zod at all external boundaries; every external API call has
try/catch + timeout + fallback; every LLM call has an explicit timeout (30s for
Haiku extraction calls; 60s strategize / 120s letter for Sonnet reasoning calls) and
a graceful error path; never commit secrets;
files under UUID paths; strip patient name/phone/Aadhaar/policy-number before any text
goes to an LLM (reinsert client-side only in the final PDF); rate-limit all public API
routes; `npx tsc --noEmit` = 0 errors before any session is done; ≤3 LLM calls on any
blocking request path; cache so a refresh never re-runs AI.

### Design system — "Dawn Sky"
White + sky blue + sunshine gold; base mist `#F4FAFE` (never cream/parchment — that was
old ClaimRight). No orange, no generic AI-gradient look. Headings: Redaction
(self-hosted, SIL OFL 1.1); body/mono: IBM Plex Sans / IBM Plex Mono. WebGL dawn-sky
hero (drifting clouds, cursor-following sun) is part of the identity. Emotional job:
the user just had a claim rejected — radiate hope, trust, clarity.

---

## 11. EVAL GATE (nothing ships if a golden case regresses)

- `scripts/eval/golden-cases.json` — seeded with the Star Health bursitis case
  (₹30,885, Excl.02 F, policy 04-Feb-25→03-Feb-26, admission 06-Nov-25, ~91-day delay).
  Correct angles: (1) trochanteric bursitis is acute/unlisted → Excl.02 misapplied;
  (2) 91-day delay + piecemeal requests → timeline violation. `must_not_say`: never
  argue "policy only ~9 months old, short of the 24-month period" as pro-claimant.
- Each case: `expected_angles`, `expected_citations`, `must_not_say` + a raw-Sonnet
  baseline (`docs/eval-baseline.md`) so "at least as good as the ungated model" is
  measurable.
- Retrieval benchmark (recall@5 / MRR) in `docs/retrieval-baseline.md`; re-run after
  every KB change.
- A test must prove a fabricated citation gets caught.

---

## 12. OUT OF SCOPE

Any non-health vertical · server-side auto-filing on government portals · success-fee
billing tier · WhatsApp automation · HITL admin panel · automated consumer-court filing
· native mobile app · A/B testing · blog · multi-language UI beyond OCR needs.

---

## 13. HOW ASHER WORKS

Claude Code runs inside the Claude desktop app (Cowork). Each session reads THIS file
first, works in phases, commits after each phase, and updates `PROGRESS.md` so any
session can resume from the last commit. `FEATURES.md` is the definition of done — flip
items only with observed evidence. End every session with `npx tsc --noEmit` clean.
Claude Code never runs Supabase migrations and never flips Razorpay to live.
