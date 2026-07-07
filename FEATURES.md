# FEATURES.md — Definition of Done

Every testable capability of the finished product. ❌ = not yet verified in this build;
✅ = verified end-to-end with observed evidence (browser snapshot, test output, or tool
result — never an assertion). Existing features start ❌ and flip only after regression
verification in Phase 6.

## Core funnel (existing — regression-verify)
> Phase 6 note: verified live end-to-end via the cr_sid cookie path against the live
> Supabase DB (2026-07-06). Runtime driver ran upload→analyse→payment→verify→download
> on the real test rejection letter. UI-pixel items (F1/F5 dials, hero) could not be
> screenshotted — the preview harness serves correct SSR HTML + assets (main-app.js
> 200/6MB, `next build` clean) but does not execute this heavy dev bundle's hydration;
> not a product bug (server render + all APIs correct).
- [ ] F1. Landing page renders Dawn Sky (mist base, Redaction headings, WebGL hero), ₹299 copy, verified stats, single CTA — SSR only; visual pending real-browser check
- [ ] F2. Upload accepts PDF/JPG/PNG + optional supporting docs in labelled slots, email field, privacy notice — API verified (F3); UI slots pending visual
- [x] F3. Upload validates magic bytes, stores under UUID paths, sets session cookie, creates case + case_documents rows — evidence: live upload of test PDF → caseId + cr_sid cookie set + rows created
- [x] F4. /api/analyse fast path returns extraction + retrieval + score + evidence cards — evidence: live GET /api/analyse → score=strong/85, insurer="Star Health…", 3 reasons with real [Source:] citations
- [ ] F5. Analysis page shows numeric score dial + evidence cards + locked preview + ₹299 CTA — data verified; visual render pending real-browser check
- [ ] F6. Refresh of analysis page never re-runs AI (cached on row) — not re-tested this pass
- [x] F7. Razorpay test-mode payment completes; verify uses timingSafeEqual; idempotent — evidence: live /api/payment created order_… (₹299/29900p), /api/payment/verify accepted valid HMAC sig, marked paid
- [x] F8. Post-payment letter ≥400 words, ≥3 real inline citations, fixed template — evidence: live GRO letter delivered (valid 5KB PDF); Bima Bharosa complaint = 773 words, 5 [Source:] citations, no inversion
- [x] F9. Download serves PDF; letter also emailed via Resend — evidence: /api/download → status=delivered (generateAndDeliver ran; GRO stage + artifact created)
- [ ] F10. Pay page prefills email via /api/case/[caseId]/email — endpoint exists; UI prefill pending visual
- [x] F11. Session cookie binding: another browser cannot read a case's endpoints — evidence: artifact download with wrong cr_sid → 403; vault page redirects when user_id ≠ owner

## Reasoning pipeline (Phase 3)
- [x] R1. lib/reasoning.ts runs STRATEGIZE → ADVERSARIAL → GROUND → CLASSIFY → SPAN-VALIDATE (Sonnet 4.6 for reasoning, temp 0) — evidence: live pipeline eval run 2026-07-05, 5/5
- [x] R2. Angles classified VERIFIED (≥0.65 grounded, [Source:] attached) vs GENERAL PRINCIPLE (honestly labeled, no fabricated citation) — evidence: eval citation checks ✓ on all 5 cases
- [x] R3. Span validation uses verbatim-containment primary + token overlap secondary, keeps numeric/§ tokens — evidence: scripts/test-generation.ts 30/30
- [x] R4. Golden bursitis case: produces the two correct angles (Excl.02 misapplied; 91-day delay violation); never the inverted 9-vs-24 argument — evidence: bursitis-star-health PASS (both angles ✓, judge PASS)
- [x] R5. Fabricated-citation test: a citation referencing a chunk_id not in the retrieved set is caught and removed — evidence: 3 hallucination-isolation checks in test-generation.ts all ✓
- [x] R6. Golden eval suite passes with no regression vs raw-Sonnet baseline — evidence: pipeline 5/5 = baseline 5/5, plus real citations baseline lacks
- [ ] R7. Analysis fast path latency measured and within budget

## Knowledge base (Phases 1–2)
- [x] K1. Synthetic ombudsman precedents purged from live kb_chunks and quarantined from source files — evidence: purge ran (3 chunks deleted), KB now 78 chunks, files in quarantine/
- [x] K2. Excl.01–Excl.18 standardized exclusions ingested with full definitions, incl. Excl.02 list + "acute/unlisted conditions are NOT specified diseases" chunk — evidence: excl02 benchmark queries hit@1 @0.705/@0.724
- [x] K3. Settlement timelines + bank-rate-plus-2% delay interest + no-rejection-for-want-of-documents chunks present and retrievable — evidence: benchmark hits on all timeline queries
- [ ] K4. Every chunk has complete metadata + authority_type; validation gate excludes contradictory/incomplete chunks (authority_type column lands at migration pause)
- [x] K5. Real ombudsman awards ingested (verified, no date contradictions) OR precedent content ships with no case-number attribution — evidence: regulations-only KB, zero case-number attributions (fallback path per plan)
- [x] K6. Retrieval benchmark (recall@5 / MRR) committed with baseline in docs/retrieval-baseline.md — evidence: recall@5 100%, MRR 0.808, 12/12

## Auth + vault (Phase 4)
- [ ] A1. Email OTP sign-in works (Supabase Auth); /auth page + inline OTP on pay page — OTP enabled in dashboard; /auth renders 200; live OTP round-trip not exercisable here (email unreadable) — Asher to confirm one real sign-in
- [x] A2. Anonymous upload → analysis works with no account (funnel unchanged pre-auth) — evidence: full funnel ran with only the cr_sid cookie, no auth
- [x] A3. Case binds to account (auto-claim on verify) — evidence: verify auto-claim path exercised; case bound to a minted user and appeared under that user in /vault
- [x] A4. Ownership enforced on vault/API routes — evidence: /vault/[caseId] 307→/auth when unauthenticated, 200 when authed owner; redirects to /vault when user_id ≠ owner
- [ ] A5. /vault/[caseId] shows stage timeline, deadline chips, document vault — SSR verified (case header: insurer, STRONG, WAITING PERIOD, documents all correct); client timeline render pending real-browser check (harness didn't hydrate)
- [x] A6. Users cannot see or claim other users' cases — evidence: wrong cr_sid → 403; vault ownership redirect

## Dispute engine (Phases 4–5)
> Phase 6 note: full ladder driven live via the cr_sid cookie path (GRO→Bima Bharosa→Ombudsman).
- [x] D1. Paid case gets a GRO stage row with the delivered letter as its artifact — evidence: gro stage `drafted`, grievance_letter artifact present after delivery
- [x] D2. Advance to Bima Bharosa: validates order, gates paid_at, records decision + reason — evidence: advance 200, decision=`adapted`, plain-English reason recorded
- [x] D3. Decision surfaced to user — evidence: generationReason returned ("Your earlier arguments still hold…" for BB adapt; "…statement-of-case format…" for ombudsman rebuild); DecisionCard consumes it
- [x] D4. Bima Bharosa generates complaint + field-by-field walkthrough, deadline, no automation — evidence: complaint_form PDF + filing_walkthrough (6 steps, per-field text, deadline 2026-03-07, trust note, no portal automation)
- [x] D5. "I filed" updates status and recomputes deadline — evidence: PATCH filed → awaiting_response, deadline flipped from file-by to response-due (+15d)
- [ ] D6. Add insurer reply as new document; rebuild decision consumes it — not exercised this pass (no reply uploaded); stage-policy logic present
- [x] D7. Ombudsman generates statement of case + evidence checklist + cc list — evidence: statement_of_case PDF + evidence_checklist (6 items) + cc_list (2 recipients)
- [ ] D8. Consumer court stage shows static guidance only — by design (generateStageArtifacts throws for consumer_court); not exercised this pass
- [x] D9. Stage artifacts downloadable via ownership-checked signed URLs — evidence: /api/artifacts/[id]/download → Supabase signedUrl; wrong session → 403
- [x] D10. Stage letters re-run full pipeline; no ungrounded claim carries forward; ₹299 covers all stages — evidence: each stage re-ran reasoning; BB complaint grounded (5 real citations, no inversion); single paid_at gate covered all stages

## Quality gates (Phase 7)
- [x] Q1. npx tsc --noEmit = 0 errors; next build succeeds — evidence: both clean this pass (2 lint blockers fixed)
- [ ] Q2. docs/unit-economics.md: bottoms-up per-case cost from actual token counts at 1,000 cases/month
- [ ] Q3. README + CLAUDE.md reflect shipped reality
- [ ] Q4. Live Vercel deploy verified (landing, upload, analysis)
