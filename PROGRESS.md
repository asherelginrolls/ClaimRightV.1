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
- [ ] **Phase 2 — KB deepening**
- [ ] **Phase 3 — REASON→GROUND→VALIDATE pipeline**
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
