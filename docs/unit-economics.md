# Unit Economics — bottoms-up per-case cost

**Measured, not estimated.** Token counts below are the actual `usage` returned by the
Anthropic API during a live end-to-end run on 2026-07-06 (the Star Health bursitis test
case: upload → analyse → pay → GRO letter → Bima Bharosa stage → Ombudsman stage),
captured via the `LOG_LLM_USAGE` instrumentation in `lib/claude.ts`. Costs = those token
counts × current list prices. No top-down guessing.

## Model prices (current list, per 1M tokens)

| Model | Role | Input | Output |
|---|---|---|---|
| Claude Haiku 4.5 (`claude-haiku-4-5`) | OCR + raw extraction | $1.00 | $5.00 |
| Claude Sonnet 4.6 (`claude-sonnet-4-6`) | strategize / adversarial / letters | $3.00 | $15.00 |

Voyage `voyage-law-2` embeddings (retrieval grounding) run on the 200M-token free tier —
KB ingestion + months of query traffic stay inside it, so ~$0 at MVP volume. OCR in this
run used Haiku vision (counted below); Sarvam is only routed for heavy non-ASCII PDFs and
has its own free tier. **Never Opus/Fable at runtime** (invariant).

## Measured tokens and cost per phase

| Phase | Model | Calls | Input tok | Output tok | Cost (USD) |
|---|---|---:|---:|---:|---:|
| **Analysis** (OCR + extraction) | Haiku 4.5 | 6 | 17,103 | 5,027 | $0.0422 |
| **Analysis** (strategize + adversarial) | Sonnet 4.6 | 2 | 2,140 | 2,951 | $0.0507 |
| **GRO letter** (post-payment) | Sonnet 4.6 | 3 | 11,650 | 8,753 | $0.1662 |
| **Bima Bharosa stage** (reason + letter) | Sonnet 4.6 | 2 | 6,301 | 5,528 | $0.1018 |
| **Ombudsman stage** (reason + letter) | Sonnet 4.6 | 2 | 6,783 | 5,449 | $0.1021 |

Worked example (GRO letter): 11,650 × $3/1e6 + 8,753 × $15/1e6 = $0.0350 + $0.1313 = **$0.1662**.

## Per-case totals

USD is authoritative (token counts × USD prices). INR shown at **₹88/USD** (state your own
rate to re-derive). Razorpay = 2% of the ₹299 charge = **₹5.98/paid case**.

| Scenario | AI cost (USD) | AI cost (₹) | + Razorpay 2% | All-in (₹) | % of ₹299 |
|---|---:|---:|---:|---:|---:|
| **Core paid case** (analysis + GRO letter) | $0.259 | ₹22.81 | ₹5.98 | **₹28.79** | 9.6% |
| **+ Bima Bharosa** advanced | $0.361 | ₹31.77 | ₹5.98 | ₹37.75 | 12.6% |
| **Full journey** (analysis + GRO + BB + Ombudsman) | $0.463 | ₹40.75 | ₹5.98 | **₹46.73** | 15.6% |

The ₹299 price covers **all stages of a case** (gated on `paid_at`), so the full-journey row
is the worst case for a single customer who escalates all the way to the ombudsman.

## At 1,000 cases/month

- Revenue (1,000 paid): **₹2,99,000**.
- AI variable cost, core-only: **~₹22,810/month**. If every case also ran BB + Ombudsman
  (unrealistic upper bound): ~₹40,750/month.
- Fixed infra at MVP volume: ₹0 (Supabase / Vercel / Resend free tiers; Voyage free tier).
- **Gross margin ≈ 90%** on the core paid case, ≈ 84% even in the full-escalation worst case.

## Delta vs the old pipeline

The pre-rebuild CLAUDE.md carried a **top-down ~₹82/case** estimate (Haiku doing the legal
reasoning). This build moves reasoning to Sonnet 4.6 (the quality floor — a wrong argument is
worth ₹0 and costs a refund + reputation), yet the **measured** core cost is **~₹23/case** —
lower than the old estimate, because the KB chunks and prompts are token-lean (small verbatim
regulation chunks, tight letter templates). The quality upgrade did not cost margin; it
improved it while the old number was a conservative guess.

## How to reproduce

```
LOG_LLM_USAGE=true npx tsx --env-file=.env.local scripts/... (or run the app)
# grep the server log for "[usage] model=… in=… out=…", sum per model per phase,
# multiply by the prices above.
```
