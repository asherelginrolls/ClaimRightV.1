# ClaimRight V2 — Session Prompts
**Read CLAUDE.md and CLAUDE_PART2.md before starting any session.**
**Each session is independent; complete in order.**

Each session below is sized to fit comfortably in a single Claude Code context window (rough budget: ≤6 files modified + ≤200K tokens read). If you hit a rate limit mid-session, stop and pick up in a fresh session — don't try to power through.

---

## Session 0 — IMMEDIATE BUG FIX (already done before this doc)
The post-payment "consult an advisor" stub was patched in `lib/generation.ts` and `prompts/generation.ts`. No action needed; this is just a checkpoint marker so Sessions 1–7 can build on a clean base.

---

## Session 1 — Finish Tier A Hardening (audit leftovers)

**Model:** Claude Sonnet 4.6, **Medium** thinking
**Why this model:** Mechanical, well-specified work. Sonnet medium is fast and reliable for security-hardening edits. Opus is overkill.

**Prereqs (you do these BEFORE the session):**
- Sign up Upstash Redis free tier → grab `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- Sign up Cloudflare Turnstile (free) → grab site key + secret key
- Razorpay dashboard → create webhook secret, set webhook URL to `https://<vercel-domain>/api/webhooks/razorpay` for `payment.captured` event
- Add all keys to Vercel env vars + local `.env.local`
- `git status` to confirm partial work-in-progress branch state

**Prompt to paste into Claude Code:**
> Read CLAUDE.md and CLAUDE_PART2.md. The previous session began Tier A hardening from the audit and stopped mid-flight. Finish the following without breaking deployed functionality:
>
> 1. Wire `lib/redis.ts` (already created) into `lib/rate-limit.ts` so it uses Upstash when env vars are present, falls back to in-memory otherwise. Add a per-day cap (50 analyses per IP per day) alongside the existing per-minute cap.
> 2. Complete `next.config.mjs` security headers refactor (CSP allowing checkout.razorpay.com, X-Frame-Options DENY, HSTS, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy). Allowed origins for Server Actions: localhost + the production Vercel URL from `process.env.NEXT_PUBLIC_APP_URL`.
> 3. Create `app/api/webhooks/razorpay/route.ts` mirroring the verify route's logic (signature check via `crypto.timingSafeEqual`, idempotency via `cases.status === 'paid'` early-exit, `waitUntil()` for the generate call). Use `RAZORPAY_WEBHOOK_SECRET`.
> 4. Add 15s `Promise.race` timeouts to `razorpay.orders.create` (in `app/api/payment/route.ts`) and `resend.emails.send` (in `lib/email.ts`).
> 5. Mount Cloudflare Turnstile on `app/upload/page.tsx`; verify token server-side in `app/api/upload/route.ts` using the existing `lib/turnstile.ts` helper.
> 6. Replace hardcoded `https://claimright.in` in `lib/email.ts` with `process.env.NEXT_PUBLIC_APP_URL` (with a hardcoded fallback).
> 7. Run `npx tsc --noEmit` and `npx next lint` — both must pass.
> 8. Do NOT modify the citation pipeline in `lib/generation.ts`. (Session 0 already hardened it.)
>
> Verify by smoke-testing upload → analyse → pay (test mode) → download on `npm run dev`.

---

## Session 2 — Multi-Document Upload

**Model:** Claude Sonnet 4.6, **Medium** thinking
**Why:** Schema + UI + route changes. Mechanical but spans multiple files.

**Prereqs:** Session 1 deployed and stable. Have Supabase Studio open in a tab — you'll paste SQL.

**Prompt:**
> Read CLAUDE.md, CLAUDE_PART2.md §5. Implement multi-document upload (up to 5 docs per case) per the spec in CLAUDE_PART2 §5.
>
> 1. Write the `case_documents` table SQL to `supabase/migrations/002_case_documents.sql` (do NOT run it; tell me to run it in Supabase Studio when you're done).
> 2. Update `app/upload/page.tsx`: replace single file input with 5 labelled slots (Rejection Letter — REQUIRED; Policy Doc; Hospital Bills; Discharge Summary; Prior Correspondence). Each slot accepts one file, all optional except rejection letter.
> 3. Update `app/api/upload/route.ts`: iterate `formData.getAll('files')` with parallel `doc_type` array; magic-byte validate each; insert one `case_documents` row per file. Keep `cases.document_path` mirror to the rejection_letter row for back-compat.
> 4. Update `lib/ocr.ts` and `app/api/analyse/route.ts`: fetch all `case_documents` for the case, OCR each, concatenate with `### {doc_type}\n{ocr_text}\n` headers before sending to extraction.
> 5. Update `prompts/extraction.ts` to acknowledge multi-doc context (extract from any of the supplied docs; prefer rejection letter for category, prefer policy doc for policy_no, prefer bills for claim_amount).
> 6. Update `types/case.ts` to add `CaseDocument` type.
> 7. `npx tsc --noEmit` clean. Smoke test: upload 3 docs, confirm all 3 are stored, confirm analyse uses the combined text.

---

## Session 3 — Numeric Fightability Score + Conversion Screen 3

**Model:** Claude Opus 4.7, **Medium** thinking
**Why:** Touches the scoring math + UI redesign. Opus reasons better about score formula edge cases. Medium thinking is enough — don't burn Heavy for this.

**Prereqs:** Session 2 deployed. Have `landing.html` open as design reference.

**Prompt:**
> Read CLAUDE.md, CLAUDE_PART2.md §3 and §4. Implement the numeric fightability score AND the Screen 3 conversion redesign.
>
> 1. Write SQL to add `fightability_numeric INTEGER` and `evidence_summaries JSONB` columns to `cases` → `supabase/migrations/003_fightability_numeric.sql` (don't run; tell me to).
> 2. Implement `computeNumericScore(retrievalResult, category)` in `lib/scoring.ts` per CLAUDE_PART2 §3 formula. Add to analyse API response and persist to the new column.
> 3. Generate plain-English 1-line explainers for top-3 evidence chunks via a single Haiku call inside `app/api/analyse/route.ts`; store in `evidence_summaries` JSONB.
> 4. Redesign `app/analysis/[caseId]/page.tsx` per CLAUDE_PART2 §4:
>    - Numeric radial progress (Tailwind + small SVG arc, no chart library)
>    - "We matched N regulations and M precedents" counters
>    - 3 visible evidence cards (chunk title + section + plain-English explainer)
>    - Blurred preview block with `backdrop-filter: blur(8px)` + "Locked" overlay
>    - CTA: "Unlock full analysis + formal dispute letter — ₹99"
>    - Trust strip with 4 chips (incl. "Money back if no real regulation matches your case" only if Asher confirms)
> 5. Update copy across the app: "dispute letter" → "full analysis + dispute letter".
> 6. Reference `../landing.html` for color tokens, type, spacing — do NOT copy any JS.
> 7. `npx tsc --noEmit` and `npx next lint` clean. Smoke test on a real case.

---

## Session 4 — Formal Letter Template Polish + Category Baselines + Regression Tests

**Model:** Claude Opus 4.7, **Heavy** thinking
**Why:** Highest-stakes correctness work — the post-payment invariant. Session 0 already shipped a minimal version; this session hardens it. Opus Heavy is justified because the failure mode is "user pays and gets garbage". Worth the cost.

**Prereqs:** Sessions 1–3 deployed. Have 3 test rejection letters ready (one strong KB-match, one medium, one zero-match).

**Prompt:**
> Read CLAUDE.md, CLAUDE_PART2.md §1 and §2. Session 0 shipped a minimum-viable post-payment guarantee. This session hardens it.
>
> 1. Extract the inline category-baseline paragraphs from `prompts/generation.ts` into a dedicated `prompts/category-baselines.ts` — one entry per canonical category, each with: a one-paragraph formal-English baseline argument, the IRDAI provision it generally cites, and a fallback citation snippet pointing to the Master Circular (which IS in the KB).
> 2. Polish `prompts/generation.ts` to enforce the formal template structure from CLAUDE_PART2 §2 *verbatim*. Variables filled by Sonnet; the structural skeleton + the "I request" tri-clause + closing escalation clause are non-editable string constants prepended/appended around the LLM-drafted body.
> 3. Refine `lib/generation.ts`:
>    - Confirm post-payment never returns the legacy stub (Session 0 already removed it; verify with grep).
>    - Span validation post-payment: keep softening behavior; only delete sentences whose citation marker references a chunk_id NOT in the retrieved set.
>    - Hard minimums: ≥ 400 words, ≥ 3 inline citations. If short, append a baseline paragraph.
> 4. Add `scripts/test-generation.ts`: runs all 9 categories × {high-score, low-score, empty} mocked retrievals through `generateDisputeLetter`. Asserts every output meets §1 hard minimums. 27 cases must pass.
> 5. `npx tsc --noEmit` clean. Run the regression script — all 27 cases must pass.

---

## Session 5 — Retrieval Quality Upgrade + Diagnostic

**Model:** Claude Opus 4.7, **Medium** thinking
**Why:** Needs careful reasoning about query expansion + recall measurement. Opus medium is right.

**Prereqs:** Sessions 1–4 deployed. Have a redacted version of Asher's mom's case text as a benchmark.

**Prompt:**
> Read CLAUDE.md, CLAUDE_PART2.md §6. Diagnose and fix the retrieval semantic gap (piecemeal-style cases not matching).
>
> 1. Build `scripts/diagnose-retrieval.ts`: 10 known-hard queries (piecemeal docs, post-60mo PED, 1hr cashless, 3hr discharge, etc.). Print top-5 chunks with similarity scores, and which canonical citations were *expected* + whether they appeared.
> 2. Run the diagnostic against the live KB. Capture baseline output in `docs/retrieval-baseline.md`.
> 3. Implement category-aware query expansion in `lib/retrieval.ts` per CLAUDE_PART2 §6. Synonym map covers all 9 categories.
> 4. Lower retrieval-step threshold from 0.65 → 0.55 (pre-payment generation gating stays at 0.65).
> 5. Re-run the diagnostic. Capture improved output. If recall didn't improve on the piecemeal case, expand the synonym list further or escalate to Session 6 (KB may be missing the chunk entirely).
> 6. `npx tsc --noEmit` clean. Commit baseline + improved retrieval reports.

---

## Session 6 — KB Audit + Expansion (with claimright-kb-curator skill)

**Model:** Claude Sonnet 4.6, **Medium** thinking
**Why:** Document curation, not code reasoning. Sonnet handles structured retrieval and the kb-curator skill well.

**Prereqs:** Session 5 diagnostic baseline available. The `claimright-kb-curator` skill must be installed.

**Prompt:**
> Use the `claimright-kb-curator` skill. Read `docs/retrieval-baseline.md` from Session 5. For every query where recall was poor, identify whether (a) we're missing a relevant document in the KB, or (b) we have it but it's chunked badly, or (c) synonym expansion alone wasn't enough.
>
> For (a): fetch and structure the missing IRDAI circulars / ombudsman awards. Add markdown files in `scripts/kb-source-docs/`. Run `scripts/ingest-md.ts`.
> For (b): adjust chunking (smaller chunks for dense regulatory text, e.g. 250 tokens with 75-token overlap) and re-ingest those specific docs.
> For (c): pass the failed queries back to Session 5's synonym map.
>
> Re-run `scripts/diagnose-retrieval.ts` — must show improvement on every previously-failing query.

---

## Session 7 — Tier B/C Cleanup + Pre-Live Checklist

**Model:** Claude Haiku 4.5
**Why:** Pure mechanical cleanup. Haiku is fast and cheap for this.

**Prereqs:** Sessions 1–6 done. Razorpay live keys present in Vercel env (still paused, not switched yet).

**Prompt:**
> Read CLAUDE.md, CLAUDE_PART2.md §7. Execute the audit's leftover Tier B/C items + pre-live verification.
>
> 1. Fix `lib/ocr.ts` Hindi-PDF detection (try Sarvam first for PDFs, fallback to Haiku Vision on failure — see audit Tier B1).
> 2. Replace `app/pay/[caseId]/page.tsx` useless prefetch with a tiny `/api/case/[caseId]/email` endpoint (audit B2).
> 3. Tighten Supabase storage RLS (audit B5) — write the SQL into `supabase/migrations/004_storage_rls.sql`.
> 4. Add session/email cookie binding (audit B6) — HTTP-only cookie set at upload, validated on later routes.
> 5. Centralize magic numbers (0.65 / 0.70 / 0.80 / 0.40) in `lib/thresholds.ts` (audit C5).
> 6. Migrate Google Fonts to `next/font/google` (audit C6).
> 7. Replace boilerplate README.md with a 30-line ClaimRight readme.
> 8. Run the full pre-live checklist from CLAUDE_PART2 §7. Output a checklist with each item ✅ or ❌. Do NOT switch Razorpay live keys yourself.

---

## Model usage summary

| Session | Model | Thinking | Why |
|---|---|---|---|
| 0 | Opus 4.7 | Default | Already shipped — this doc |
| 1 | Sonnet 4.6 | Medium | Mechanical hardening |
| 2 | Sonnet 4.6 | Medium | Schema + UI + route changes |
| 3 | Opus 4.7 | Medium | Score math + UI redesign |
| 4 | Opus 4.7 | **Heavy** | Post-pay correctness — highest stakes |
| 5 | Opus 4.7 | Medium | Retrieval reasoning |
| 6 | Sonnet 4.6 | Medium | KB curation |
| 7 | Haiku 4.5 | Default | Cleanup |

Total estimated model spend on Asher's Claude Pro plan across all 7 sessions: rough ballpark, your subscription covers it.

---

## Order discipline

Do not skip ahead. Each session assumes the prior one's deliverables are deployed and stable. If a session fails halfway, do not start the next one — fix the broken one first.

If a session blows the context window mid-flight: stop, commit what works, open a new conversation, and ask Claude Code to "resume Session N from <last completed step>".
