# FEATURES.md — Definition of Done

Every testable capability of the finished product. ❌ = not yet verified in this build;
✅ = verified end-to-end with observed evidence (browser snapshot, test output, or tool
result — never an assertion). Existing features start ❌ and flip only after regression
verification in Phase 6.

## Core funnel (existing — regression-verify)
- [ ] F1. Landing page renders Dawn Sky (mist base, Redaction headings, WebGL hero), ₹299 copy, verified stats, single CTA
- [ ] F2. Upload accepts rejection letter PDF/JPG/PNG + optional supporting docs in labelled slots, email field, privacy notice
- [ ] F3. Upload validates magic bytes, stores under UUID paths, sets session cookie, creates case + case_documents rows
- [ ] F4. /api/analyse fast path returns extraction + retrieval + score + evidence cards within Vercel limits (≤3 blocking LLM calls)
- [ ] F5. Analysis page shows numeric score dial (NN/100 + band), extracted insurer/amount/reason, 2–3 evidence cards with real citations, locked letter preview, ₹299 CTA
- [ ] F6. Refresh of analysis page never re-runs AI (cached on row)
- [ ] F7. Razorpay test-mode payment completes; verify uses timingSafeEqual; idempotent
- [ ] F8. Post-payment letter generated: ≥400 words, ≥3 real inline citations, fixed template (tri-clause, escalation sentence, enclosures, disclaimer footer)
- [ ] F9. Download page serves PDF; letter also emailed via Resend
- [ ] F10. Pay page prefills email via lightweight /api/case/[caseId]/email endpoint
- [ ] F11. Session cookie binding: another browser cannot read a case's analyse/generate endpoints

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
- [ ] A1. Email OTP sign-in works (Supabase Auth); /auth page + inline OTP on pay page
- [ ] A2. Anonymous upload → analysis still works with no account (funnel unchanged pre-auth)
- [ ] A3. Case binds to account at/before payment (claim endpoint + auto-claim on verify)
- [ ] A4. /vault lists the user's cases; ownership enforced in API routes
- [ ] A5. /vault/[caseId] shows stage timeline, deadline chips, document vault grouped by stage
- [ ] A6. Users cannot see or claim other users' cases

## Dispute engine (Phases 4–5)
- [ ] D1. Paid case gets a GRO stage row with the delivered letter as its artifact
- [ ] D2. Advance to Bima Bharosa: validates order, gates on paid_at, records adapted|rebuilt decision + plain-English reason
- [ ] D3. Decision surfaced to user in a DecisionCard
- [ ] D4. Bima Bharosa stage generates complaint text + field-by-field filing walkthrough (exact text per portal field, deadline computed) — no portal automation
- [ ] D5. "I filed" updates status and recomputes deadlines (lib/deadlines.ts pure functions)
- [ ] D6. User can add the insurer's reply as a new document; rebuild decision consumes it
- [ ] D7. Ombudsman stage generates statement of case + evidence checklist + cc list
- [ ] D8. Consumer court stage shows static guidance only
- [ ] D9. Stage artifacts downloadable via ownership-checked signed URLs
- [ ] D10. Stage letters re-run the full pipeline; no ungrounded claim carries forward; ₹299 covers all stages

## Quality gates (Phase 7)
- [ ] Q1. npx tsc --noEmit = 0 errors; next build succeeds
- [ ] Q2. docs/unit-economics.md: bottoms-up per-case cost from actual token counts at 1,000 cases/month
- [ ] Q3. README + CLAUDE.md reflect shipped reality
- [ ] Q4. Live Vercel deploy verified (landing, upload, analysis)
