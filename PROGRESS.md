# PROGRESS.md — Build log (resume from here)

## RESUME POINT (2026-07-08) — Fix-and-polish round (branch claude/gallant-engelbart-85d48f)
Root causes of "the funnel always gets stuck" found and fixed:
1. **vercel.json capped /api/analyse at 60s** while the pipeline needs ~85–120s → killed
   mid-run. Now 300s (download 300s, generate 180s, stages 300s; route exports agree).
2. **Post-payment dead-end**: download-route generation (up to ~205s) inside a 120s
   function → Vercel killed it after `status='generating'` was set, the catch never ran,
   and every later poll returned pending forever. Fixed: atomic claim, migration 014
   (`cases.generation_started_at` — **Asher must run in Studio**), stale-claim auto-reset,
   serve-letter-if-already-uploaded, email 10s-capped + non-fatal.
3. **Sarvam OCR never worked** — v1/vision/ocr is 404; every PDF silently used Haiku.
   Replaced with the official job-based Document Intelligence flow (sarvamai SDK), 90s
   budget, Haiku fallback kept, failures logged. Verified live: 13.5s for the test letter.
4. OTP UX (cooldown/resend/copy), early lead capture on the analysis page, auth-aware
   header, /api/download now ownership-checked (was open to anyone with the UUID),
   in-place retries on analysis/download pages, "Why this score" verified-source tags.
5. New: scripts/e2e-smoke.ts (npm run test:smoke / test:smoke:stages) with per-step
   timings; npm run test = tsc + 30 offline generation checks.
⚠️ BLOCKED on live verification: **the Anthropic API key is out of credits** ("credit
balance is too low") — smoke run proved OCR-fallback + letter generation fail. After
top-up: `npm run test:smoke` (local) must go green, then re-verify on Vercel.
Supabase dashboard fixes (Site URL, {{ .Token }} templates, Resend SMTP) are Asher's —
see the PR description / session summary. Phase-6 test data cleaned (user deleted;
case ad556e34 was already gone).
⚠️ CODE REVIEW NOT DONE: /code-review finder agents (angles A+B diff scan /
removed-behavior, C cross-file tracer, cleanup+conventions) were launched but the
session limit killed them before any findings returned. The next session MUST re-run
/code-review on this branch's diff (main...HEAD) and fix findings before merge.
Known review-worthy spots: download route's `'generation_started_at' in caseRow`
column-detection, stages-route lock-claim type casts, OtpSignIn resend calling
sendCode() (re-validates email — fine, but double-check cooldown interplay),
smoke-script storage cleanup missing nested stages/ folders.

Plan: the Ashray one-shot build PRD (Phases 0–8). Each phase ends with tsc clean +
commit + an update here. FEATURES.md is the definition of done.

## Phase status
- [x] **Phase 0 — Setup & housekeeping** (this commit)
  - .env.local copied from main repo into worktree (not committed).
  - Cherry-picked backend parts of f56ea1c: Sarvam-first OCR (lib/ocr.ts), cookie
    binding (upload sets `cr_sid`; analyse/generate check it, SKIP_COOKIE_CHECK
    bypass), /api/case/[caseId]/email + pay-page prefill swap, timingSafeEqual on
    payment/verify, lib/thresholds.ts (merged with the 0.55/0.65 split already on
    main — canonical constants now live there; retrieval.ts re-exports), storage RLS
    SQL renumbered to supabase/migrations/008_storage_rls.sql (NOT yet run — goes in
    the migration pause batch). Discarded f56ea1c font/layout/README hunks
    (pre-rebrand).
  - Docs reconciled: CLAUDE_V3.md content → new CLAUDE.md (V4, Ashray/₹299/new
    scope); V1/V2/session prompts archived to docs/archive/.
  - FEATURES.md + PROGRESS.md created.
- [x] **Phase 1 — Eval harness + KB honesty triage**
  - ⚠️ **BLOCKER FOUND: the Supabase project (mrjohcoosaopyfvmrgtu.supabase.co) no
    longer exists** — NXDOMAIN from public DNS. Free-tier project was deleted after
    pause (.env.local dated May 9). ALL DB work (purge, ingestion, retrieval
    benchmark runs, the runtime funnel, the live Vercel site) is blocked until Asher
    creates/restores a project. Folded into the migration pause: he'll create a
    fresh project, run migrations 001→0xx, update .env.local + Vercel env, then we
    re-ingest the KB from local source docs (all present in scripts/source-docs +
    scripts/kb-source-docs). Anthropic + Voyage keys verified working.
  - Synthetic precedents quarantined: files moved to
    scripts/kb-source-docs/quarantine/ (with README), registry.csv marked
    QUARANTINED-SYNTHETIC-DO-NOT-REINGEST. scripts/purge-synthetic-precedents.ts
    written (idempotent) — run it only if the OLD project ever comes back; a fresh
    project simply never ingests the quarantined file.
  - scripts/eval/golden-cases.json: 5 cases (bursitis golden case + piecemeal,
    PED-after-moratorium, cashless-delay, and the non-disclosure-at-18-months
    adversarial trap), each with expected_angles, expected_citations, must_not_say
    regexes + a Haiku judge question.
  - scripts/eval/run-golden.ts: --baseline mode (raw Sonnet 4.6, no KB) ran →
    docs/eval-baseline.md committed, **5/5 pass** (raw Sonnet finds all correct
    angles and avoids all traps — but fabricates citation specifics, noted in the
    doc). Pipeline mode wired to lib/reasoning.runReasoningPipelineForEval (Phase 3).
  - scripts/eval/retrieval-benchmark.ts: recall@5 + MRR against fixed expected
    citations; writes docs/retrieval-baseline.md with --write. Cannot run until
    Supabase is back — includes the two Excl.02 queries that measure the known gap.
- [x] **Phase 2 — KB deepening** (source files ready; ingestion happens post-pause)
  - **irdai-standardized-exclusions-2019.{md,json}**: 11 chunks, Excl01–Excl18 FULL
    verbatim standard wordings extracted from the official circular PDF
    (IRDAI/HLT/REG/CIR/117/09/2019 — note: 117, not 177) fetched from New India
    Assurance's official mirror. Includes THE bursitis-case chunk (Excl02 is
    list-based per clause (f); acute/unlisted conditions cannot be repudiated under
    Excl02; accident carve-out; Chapter VI §4 bans open-ended exclusion wording) +
    Chapter II prohibited-exclusions list.
  - **irdai-mc-claims-timelines.{md,json}**: 7 verbatim chunks from the health MC —
    1hr cashless, 3hr discharge (insurer bears delay cost), TPA-collects-documents
    ("Policyholder shall not be required to submit the documents"), PMC/CRC approval
    required, 60-month moratorium, ₹5000/day ombudsman penalty, renewal protections.
  - **ppoi-claims-safeguards.{md,json}**: 4 verbatim chunks — "No claim shall be
    rejected or closed for want of documents or for delayed intimation", TAT table +
    delay interest, one-go/piecemeal principle, free-look.
  - **🔴 FACT CORRECTION: delay interest is "bank rate plus 2 percent" (suo-moto),
    NOT "2% per month".** The 2%/month figure existed ONLY in the quarantined
    synthetic precedents and had leaked into the PRD, CLAUDE.md, the letter
    tri-clause, and the documentation baseline paragraph. All fixed (prompts/
    generation.ts, prompts/category-baselines.ts, lib/scoring.ts reasons, CLAUDE.md
    §5, FEATURES.md, golden-cases.json). Also: no "30-day reimbursement settlement"
    provision exists in the verified local circular texts — claims now rest on the
    verbatim TAT table + "no rejection for want of documents".
  - Synonyms extended: Excl-code expansions, piecemeal/want-of-documents, delay
    interest terms.
  - Real ombudsman awards: cioins.co.in has no public Decisions index; the FY24-25
    annual report (real case summaries) is >10MB → manual download task for Asher.
    Fallback per plan: regulations-only KB, NO case-number attributions anywhere.
  - scripts/extract-pdf-text.ts added (generic Haiku PDF transcription utility).
  - Registry updated (3 pending_ingestion rows + 1 manual_download row). Ingestion
    command for the pause: `npx tsx --env-file=.env.local scripts/ingest-md.ts
    scripts/kb-source-docs/<file>.md scripts/kb-source-docs/<file>.json` for each.
- [x] **Phase 3 — REASON→GROUND→VALIDATE pipeline** (COMPLETE 2026-07-05)
  - Golden eval **5/5** on the live pipeline (bursitis: both angles, no inversion,
    citations real; all judges PASS). One expectation fix: non-disclosure case's
    expected_citations "PPOI Master Circular" → "|"-alternatives matching the
    actual KB source titles (PMC/CRC chunks live in the Health-MC + PPOI docs;
    no source is literally titled "PPOI Master Circular"). run-golden.ts gained
    `--case <id>` for single-case re-runs.
  - Retrieval benchmark: **recall@5 = 100% (12/12), MRR = 0.808** — committed to
    docs/retrieval-baseline.md. Both Excl.02 gap queries now hit@1.
  - Fabricated-citation catch: scripts/test-generation.ts **30/30** incl. 3
    hallucination-isolation checks (removal, title-drift, marker-omitted).
  - tsc clean. FEATURES.md: R1–R6, K1–K3, K5, K6 flipped with evidence.
  - BUILT: lib/reasoning.ts (strategize+adversarial Sonnet call temp 0 w/ truncation
    retry, batch-embed grounding via retrieveWithEmbedding, VERIFIED≥0.65 vs
    GENERAL PRINCIPLE classify, runReasoningPipelineForEval for the eval harness);
    prompts/playbooks.ts (9 category playbooks w/ traps); prompts/reasoning.ts;
    generation.ts: spanScore (verbatim-containment primary + 6-gram + numeric/§
    tokens kept), temp 0, generateLetterFromAngles + flattenLetter + truncation
    retry, generateDisputeLetter now runs REASON→GROUND first; prompts/generation.ts
    rule 6a (general-principle labeling, no fabricated citations) + <legal_angles>
    block; /api/analyse fast path wired (reasoning replaces bare retrieval; verified
    angles feed fightability_reasons; ≤3 LLM calls); scripts/eval/mock-retriever.ts
    (offline lexical mock).
  - 🔴 SUPABASE UN-BLOCKED: project was only PAUSED — auto-restored on traffic, all
    data intact. Purge ran against live DB (3 synthetic chunks deleted, KB 56→78
    after ingesting the 3 new Phase-2 chunk files). Registry marked ingested.
  - EVAL STATE: live pipeline run #1: bursitis PASSED (both angles, no inversion,
    citations real). Run #2 after strategize-truncation fix: 2/5 (strategize
    max_tokens 1500 truncated → NOW fixed w/ 2800+retry; piecemeal regex updated for
    the stronger want-of-documents ground; ped expected_citations now "|"-alternatives
    — run-golden supports "|" splitting). **NEXT STEP: re-run
    `npx tsx --env-file=.env.local scripts/eval/run-golden.ts` and iterate to 5/5;
    then retrieval benchmark `scripts/eval/retrieval-benchmark.ts --write`; then a
    fabricated-citation catch test; then commit Phase 3.**
  - NOTE: Sonnet calls need explicit timeouts (60s strategize / 120s letter — 30s
    default times out). Anthropic+Voyage+Supabase keys all verified working.
    Voyage free tier = 3 RPM (space bulk ops ~21s).
- [x] **Phase 4 — Auth + vault + dispute engine** (CODE-COMPLETE, tsc clean; runtime
      verification deferred to Phase 6 — needs migrations 009–012 applied)
  - Auth: `middleware.ts` (session refresh on /vault + /auth), `lib/auth.ts`
    (`getAuthenticatedUser` via cookie-wired server client; `canAccessCase` =
    owned→owner-only, unowned→uploading `cr_sid` session), `app/auth/page.tsx` +
    `app/components/OtpSignIn.tsx` (Supabase email-OTP), `lib/supabase-browser.ts`
    (browser client moved out of lib/supabase.ts), header "My cases" link.
  - Binding: `POST /api/cases/[caseId]/claim` (rule: user_id IS NULL AND (session
    or email match)); pay page gains inline OTP before Razorpay; payment/verify
    auto-claims the case to the signed-in user.
  - Dispute engine: migrations 009 (cases.user_id), 010 (dispute_stages +
    stage_artifacts, TEXT+CHECK, UNIQUE, generation_started_at lock, service-role
    RLS), 011 (backfill GRO stage + letter artifact for paid cases), 012
    (kb_chunks.authority_type + backfill). `lib/deadlines.ts` (pure file-by/
    response-due per stage/status), `lib/stage-policy.ts` (`decideGenerationStrategy`
    → adapted|rebuilt + plain-English reason).
  - Routes: stages advance (order + paid_at gated, marks prior escalated), stages
    GET (poll + lazy generation under a stale-lock, maxDuration 120), stages PATCH
    ("I filed" → recompute deadline), documents POST (add insurer reply), artifacts
    download (ownership → signed URL).
  - Vault UI: `/vault` (case list), `/vault/[caseId]` (`CaseTimeline` — stage
    timeline, deadline chips, decision card, advance dialog, doc vault), stage
    workspace page. `lib/deliver.ts` gained an idempotent, NON-FATAL GRO stage +
    artifact upsert (paid funnel never depends on the stage tables existing).
  - ₹299 gates on `paid_at` (covers all stages), not status.
- [x] **Phase 5 — Stage artifacts + Bima Bharosa co-pilot** (CODE-COMPLETE, tsc clean)
  - `prompts/stage-framings.ts`: gro_grievance / bb_complaint / ombudsman_form_via
    framings (headerBlock/reliefBlock/escalationBlock/systemSuffix); `generation.ts`
    `assembleValidatedLetter` + `generateLetterFromAngles` take an optional `framing`
    (a NO-OP when unset → Phase-3 GRO/eval path is byte-identical, no regression).
  - `lib/artifacts.ts` `generateStageArtifacts(caseId, stage)`: re-runs the FULL
    reasoning pipeline with stage framing + prior-stage context (insurer reply etc.),
    renders the letter PDF, plus deterministic companions — Bima Bharosa
    `filing_walkthrough` (6-step field-by-field portal JSON + trust note, NO portal
    automation), ombudsman `evidence_checklist` + `cc_list`. Uploads to
    documents/{caseId}/stages/{stage}/, upserts stage_artifacts, logs adapt/rebuild.
  - `app/components/StageWorkspace.tsx` + `stage-shared.tsx` render the walkthrough
    with copy buttons; consumer court = static guidance only.
  - `scripts/eval/stage-letter-test.ts` added.
- [ ] **⏸ MIGRATION PAUSE** (008–012 SQL to Asher, Supabase email-OTP setup) ← **NEXT: hand SQL to Asher**
- [x] **Phase 6 — End-to-end verification via the cr_sid cookie path** (2026-07-06)
  - Migrations verified live: user_id ✓, authority_type 78/78 ✓; dispute tables 403'd
    → fixed with grants (migration 013, Asher ran it) → now OK (6 GRO backfill rows).
  - Full funnel driven live on the real test PDF: upload→analyse→payment→verify→download.
    Bursitis case scores **STRONG (85)** with the correct Excl.02 "list-based exclusion"
    angle + real [Source:] citations — NOT the inverted 9-vs-24 argument. Razorpay test
    order (₹299), HMAC verify, delivery all pass.
  - Full dispute ladder driven live: GRO→Bima Bharosa (decision=adapted)→Ombudsman
    (decision=rebuilt), both reasons surfaced. Bima Bharosa complaint = **773 words,
    5 real citations, no inversion**; 6-step filing walkthrough (per-field text, deadline,
    trust note, no portal automation); ombudsman statement_of_case + evidence_checklist
    (6) + cc_list (2). "I filed" recomputes deadline. Artifact signed-URL download works;
    wrong cr_sid → **403**. Auth minted via admin key → vault page 200, correct case
    header (insurer/STRONG/waiting-period/docs); unauth → 307 /auth.
  - **KNOWN LIMITATION (not a product bug):** the preview harness serves correct SSR
    HTML + assets (main-app.js 200/6MB, `next build` clean) but does not execute this
    heavy dev bundle's client hydration — so interactive UI (score dial, vault timeline
    chips, DecisionCard render) could not be screenshotted. Server render + every API/
    data path verified correct. Confirm the interactive UI in a real browser post-deploy.
  - tsc + next build both clean (fixed 2 lint blockers). FEATURES.md flipped with evidence.
  - Test data left in live DB: case ad556e34…, user phase6-vault@ashray.test (harmless).
  - NOT yet done: D6 (insurer-reply→rebuild), D8 (consumer-court guidance), A1 (real OTP
    round-trip — needs a readable inbox), landing/analysis UI visuals.
- [x] **Phase 7 — Unit economics + final gates** (2026-07-06)
  - `lib/claude.ts` gained gated (`LOG_LLM_USAGE`) per-call token-usage logging.
  - `docs/unit-economics.md`: MEASURED bottoms-up from a live full run. Core paid case
    (analysis + GRO letter) = $0.259 ≈ ₹22.81 AI + ₹5.98 Razorpay = ₹28.79 all-in
    (~90% margin at ₹299). Full journey incl. BB + Ombudsman ≈ ₹46.73 (~84% margin).
    Cheaper than the old top-down ₹82 estimate despite Sonnet-for-reasoning. Prices:
    Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15 per 1M; INR @ ₹88/USD.
  - Q3 (README/CLAUDE.md to shipped reality): CLAUDE.md is V4 (Phase 0); README left as
    the recent rewrite — minor, not blocking deploy.
- [ ] **Phase 8 — Merge & live deploy** ← IN PROGRESS

## Notes for resuming sessions
- Worktree: `.claude/worktrees/suspicious-hamilton-5a8a2d`, branch
  `claude/suspicious-hamilton-5a8a2d`. PR #18 open → main.
- Razorpay is TEST mode. Email domain stays claimright.in on Resend.
- Migrations 008–012 are written but NOT applied — they go to Asher at the pause.
- Synthetic precedents already purged from live kb_chunks (Phase 3).

## RESUME POINT (2026-07-06, Opus took over from Fable — Asher out of credits)
Phases 0–5 are committed and tsc-clean. **We are at the MIGRATION PAUSE.**
Asher must, in the live Supabase project:
  1. Run migrations 008→012 (combined SQL block was handed to him).
  2. Enable Email OTP auth in Supabase dashboard (Authentication → Providers →
     Email → enable "Email OTP"/magic-link; default SMTP is fine for testing,
     custom SMTP later for volume).
  3. Re-ingest is NOT needed (KB already at 78 chunks live); migration 012 just
     backfills authority_type on the existing rows.
**2026-07-06 — migrations applied, one follow-up grant pending.** Asher ran 008–012.
Verified live: cases.user_id ✓, kb_chunks.authority_type 78/78 ✓. BUT dispute_stages /
stage_artifacts 403'd — migration 010 enabled RLS without GRANTing service_role
(same bug class as 004). Fixed: grants added to 010 + standalone migration 013.
**Asher must run migration 013 (2 GRANT lines) in Studio before Phase 6.** Also fixed
2 lint errors that blocked `next build` (build now green, all routes compile).

When Asher runs 013 + replies "done": resume at **Phase 6** — end-to-end browser
verification. NOTE: preview MCP is rooted in the hopeful-khorana worktree, not this
one — start the dev server directly in THIS worktree (launch.json → next dev :3000)
and drive it; anonymous funnel + dispute engine both work via the cr_sid cookie path
without OTP (canAccessCase allows unowned cases by cookie), so OTP email (unreadable
here) is not a hard blocker for verifying the dispute engine.

When Asher replies "done": resume at **Phase 6** — end-to-end browser verification
with the real test PDF (scripts/test-docs/test-rejection-letter.pdf.pdf), flipping
FEATURES.md items with observed evidence. Then Phase 7 (unit-economics doc from
logged token counts) and Phase 8 (merge PR #18 → main → verify live Vercel site).
Do NOT merge PR #18 until Phase 6 verification passes.
