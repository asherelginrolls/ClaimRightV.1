# ClaimRight — CLAUDE.md Part 2 (V2 Addendum)
**Read this AFTER CLAUDE.md. These rules supersede CLAUDE.md where they conflict.**
**Last updated: May 2026.**

This addendum captures decisions made after the V1 MVP shipped to Vercel and was tested with real cases. The original CLAUDE.md remains authoritative for stack, schema, anti-hallucination pipeline, and team context. Anything here is *additive* or *supersedes* the equivalent V1 rule.

---

## 1. POST-PAYMENT GUARANTEE (NEW, NON-NEGOTIABLE)

**Rule:** Once a user has paid (`cases.status = 'paid'`), the system MUST always deliver a real, formal, structured dispute letter. The "we couldn't find a regulation, consult an advisor" stub is BANNED for paid cases.

**Why:** A paying user receiving a generic "consult an advisor" PDF is a refund-and-reputation event. It happened in testing.

**Implementation contract** (`lib/generation.ts`):
- Pre-payment analyse step: KB-miss fallback on Screen 3 is OK (we just show "Difficult / consult advisor" band).
- Post-payment generate step: even if top-chunk similarity < 0.65, the function MUST produce a complete formal letter using:
  1. Whatever chunks we retrieved (top 3, regardless of score), AND
  2. A procedural baseline (right to grievance, 15-day GRO response window, Bima Bharosa + Ombudsman escalation rights) which is universally applicable to *any* health claim rejection in India, AND
  3. Span validation still runs — but FAIL spans get **softened** (not deleted) post-payment, with a footnote disclaimer. Sentences are only removed if their citation marker references a chunk_id not in the retrieved set (true hallucination).
- Hard minimums: ≥ 400 words and ≥ 3 inline citations to real KB sources.

**Test:** Submit a case with rejection text that has zero KB matches; confirm post-payment PDF is still a complete formal letter, not a stub.

---

## 2. FORMAL DISPUTE LETTER TEMPLATE (NEW)

The generation prompt (`prompts/generation.ts`) must enforce this structure. Sonnet fills variables; structure is fixed.

```
[Date]
To,
The Grievance Redressal Officer
[Insurer Name]

Subject: Formal Grievance — Claim Repudiation Dispute — Policy No. [X], Claim No. [Y]

Dear Sir/Madam,

I, [Name], hold policy [X] with [Insurer Name]. On [date], my claim for [amount] was
rejected/repudiated on the ground of [reason category — formal phrasing]. I respectfully
submit that this rejection is not in accordance with the Insurance Regulatory and
Development Authority of India (IRDAI) regulations governing health insurance claims,
for the following reasons.

[3–5 numbered paragraphs. Each paragraph: one specific argument, one or more inline
 citations, formal English. No conversational language.]

In light of the above, I request that you:
(i)   Reconsider and settle the claim of [amount] in full;
(ii)  Pay interest at 2% per month on the delayed amount as mandated by the IRDAI
      Master Circular on Health Insurance dated 29.05.2024, if applicable;
(iii) Provide a written reasoned response within 15 days as required under IRDAI
      grievance redressal norms.

Should the response be unsatisfactory or not received within 15 days, I reserve the
right to escalate this matter to the IRDAI Bima Bharosa portal and subsequently to the
Insurance Ombudsman under the Insurance Ombudsman Rules 2017.

Yours sincerely,
[Name]
[Contact — email only]

Enclosures:
1. Copy of policy document
2. Copy of claim repudiation letter
3. Hospital bills and discharge summary
4. [Any other documents the user uploaded]

---
This letter is based on verified IRDAI regulations and Insurance Ombudsman precedents.
All citations sourced from official IRDAI circulars and CIO awards. This is not legal advice.
```

**Hard rules:**
- No "I feel" / "kindly" softeners. Formal Indian legal-correspondence English only.
- Every numbered paragraph ends with at least one inline `[Source: …]` citation.
- The "I request" tri-clause is mandatory and never edited by the LLM.
- Enclosures list reflects which docs the user actually uploaded (multi-doc support — see §5).

---

## 3. NUMERIC FIGHTABILITY SCORE (NEW)

`fightability_score` (`'low' | 'medium' | 'strong'`) stays for backwards compatibility. **Add** `fightability_numeric` (integer 0–100) as a derived metric.

**Computation (`lib/scoring.ts`):**
```
base = floor(top_chunk_similarity * 100)            // e.g. 0.81 → 81
category_bonus = {                                   // additive, capped at +20
  documentation_incomplete: 20,
  cashless_denial: 18,
  pre_existing_condition_post_60mo: 15,
  waiting_period_passed: 12,
  experimental_treatment: 8,
  other: 0,
}[category]
penalty  = (category === 'fraud_suspected') ? -40 : 0
penalty += (kb_miss_count > 0) ? -10 : 0
score    = clamp(base + category_bonus + penalty, 5, 95)
```

**Mapping back to band:** ≥70 = strong, 40–69 = medium, <40 = low.

**Display:** `78 / 100 — Strong case` on Screen 3 with a colored radial progress.

---

## 4. SCREEN 3 = CONVERSION PAGE (REDESIGN)

V1 Screen 3 is informational. V2 Screen 3 is a *conversion landing page*. New layout (top to bottom):

1. **Numeric score** + band badge + insurer name + claim amount (extracted)
2. **"We matched N IRDAI regulations and M ombudsman precedents to your case"** — counter pulled from retrieval
3. **3 evidence cards (visible, not blurred)** — top 3 retrieved chunks with title + section + 1-line plain-English explainer
4. **Pivotal blur point** — below the cards, a blurred preview of:
   - Full point-by-point regulation analysis
   - Specific deadlines applicable to their case (e.g. "GRO response due by Mar 22")
   - Ombudsman win-rate estimate for this category
   - Custom-drafted dispute letter (1 paragraph teaser visible, rest blurred)
5. **Single CTA** — "Unlock full analysis + formal dispute letter — ₹99"
6. **Trust strip** — "94.5% ombudsman resolution rate · IRDAI-cited · No success fee · Money back if no real regulation matches your case"

**Pricing copy change:** Everywhere it says "Get your dispute letter — ₹99", change to "Get full analysis + dispute letter — ₹99". The free Screen 3 becomes a teaser, paid version unlocks full analysis report **and** the PDF.

---

## 5. MULTI-DOCUMENT UPLOAD (NEW)

V1 accepts one PDF/image (rejection letter). V2 accepts up to 5 documents per case.

**Categories (UI-presented, optional except rejection letter):**
1. Rejection / repudiation letter — REQUIRED
2. Policy document / certificate of insurance — optional but high-value
3. Hospital bills / final invoice — optional
4. Discharge summary / medical records — optional
5. Prior correspondence with insurer (emails, GRO response) — optional

**Schema change (one new table, no breaking change to `cases`):**
```sql
CREATE TABLE case_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'rejection_letter', 'policy_document', 'hospital_bills',
    'discharge_summary', 'prior_correspondence', 'other'
  )),
  storage_path TEXT NOT NULL,
  ocr_text TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE case_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON case_documents USING (auth.role() = 'service_role');
```

`cases.document_path` stays for backwards compat (mirrors the rejection_letter row).

**OCR pipeline:** Each document is OCR'd separately, results concatenated with type headers (`### Rejection Letter\n…\n### Policy Document\n…`) before fact extraction.

**No major refactor required:** upload route iterates over `formData.getAll('files')`, calls existing `extractTextFromDocument()` per file, writes one `case_documents` row each.

---

## 6. RETRIEVAL QUALITY UPGRADE (NEW)

**Diagnosed problem:** "piecemeal document requests" — a real IRDAI violation — wasn't matching because no chunk contains the word "piecemeal". Voyage `voyage-law-2` is supposed to be semantic, but with only ~50 KB chunks and short queries, lexical overlap dominates.

**Fix:** Query expansion before retrieval. In `lib/retrieval.ts`, before embedding the case facts, expand the query with category-specific synonyms (full map in Session 5).

Also: lower retrieval `match_threshold` from 0.65 → 0.55 for the *retrieval* step, but keep the 0.65 floor for *generation gating* in pre-payment (so we still see weaker chunks to rerank, but won't *score* off them). Post-payment gating is governed by §1, not by 0.65.

**Diagnostic script** (`scripts/diagnose-retrieval.ts`): runs 10 known-hard test queries (incl. piecemeal case), prints top-5 chunks with scores. Run after every KB ingest.

---

## 7. RAZORPAY SAFETY GATE (REINFORCEMENT)

Do NOT switch Razorpay to live mode until ALL of these are deployed and verified:
- [ ] Upstash Redis-backed rate limiting (per-min + per-day caps)
- [ ] Cloudflare Turnstile on /upload
- [ ] Magic-byte file validation
- [ ] `waitUntil()` on /api/payment/verify
- [ ] Idempotency check on /api/payment/verify
- [ ] `app/api/webhooks/razorpay/route.ts` deployed + RAZORPAY_WEBHOOK_SECRET set
- [ ] `crypto.timingSafeEqual` for signature compare
- [ ] 15s timeouts on Razorpay + Resend
- [ ] Anthropic console daily spend cap set to $10/day
- [ ] Voyage usage alert configured

Until then: Razorpay TEST keys only. No paid acquisition. No public launch.

---

## 8. CODING RULES — DELTA FROM CLAUDE.md

Add to existing rules:

13. **Post-payment code paths must always produce output** — never return a "no data, sorry" PDF after `paid_at` is set. This is the #1 invariant.
14. **All new tables must have RLS enabled with `service_role_only` policy by default.** Public-read is opt-in per-table with explicit justification.
15. **Synonym maps in `lib/retrieval.ts` are versioned with the KB.** When KB changes, re-run `scripts/diagnose-retrieval.ts` and update synonyms if recall drops.
16. **Multi-doc OCR concatenation must include doc-type headers** so the LLM knows which fact came from which source.

---

## 9. WHAT'S STILL OUT OF SCOPE

Same as CLAUDE.md V1, plus explicitly:
- Real-time WhatsApp notifications
- User dashboard / login system
- Insurer-specific letter templates beyond the 9 categories
- Success-fee pricing (Gopi's tiered model — post-MVP)
- Vernacular UI (English only for V2)
- Auto-filing to Bima Bharosa or CIO (legally prohibited per CLAUDE.md V1 §"Dispute Escalation Process")
