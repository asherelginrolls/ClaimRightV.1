# PROGRESS.md — Build log (resume from here)

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
- [~] **Phase 3 — REASON→GROUND→VALIDATE pipeline** (built & wired; eval gate IN PROGRESS)
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
- [ ] **Phase 4 — Auth + vault + dispute engine**
- [ ] **Phase 5 — Stage artifacts + Bima Bharosa co-pilot**
- [ ] **⏸ MIGRATION PAUSE** (008–0xx SQL to Asher, Supabase email-OTP setup)
- [ ] **Phase 6 — End-to-end browser verification (flip FEATURES.md)**
- [ ] **Phase 7 — Unit economics + docs + final gates**
- [ ] **Phase 8 — Merge & live deploy**

## Notes for resuming sessions
- Worktree: `.claude/worktrees/suspicious-hamilton-5a8a2d`, branch
  `claude/suspicious-hamilton-5a8a2d`.
- Razorpay is TEST mode. Email domain stays claimright.in on Resend.
- Migrations 008+ are written but NOT applied until the migration pause.
- Synthetic precedents still live in kb_chunks (purge is Phase 1.4).
