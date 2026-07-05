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
- [ ] **Phase 1 — Eval harness + KB honesty triage**
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
