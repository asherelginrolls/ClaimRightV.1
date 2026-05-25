# ClaimRight

AI-powered health insurance dispute co-pilot for India. Upload a rejection letter, get a fightability score backed by verified IRDAI regulations and ombudsman precedents, then generate a formal dispute letter PDF — all for ₹99.

## Stack

- **Frontend/Hosting:** Next.js 14 (App Router) + Tailwind CSS, deployed on Vercel
- **Database/Storage:** Supabase (PostgreSQL + pgvector + file storage)
- **Embeddings:** Voyage AI (`voyage-law-2`) — legal-domain fine-tuned
- **LLM:** Claude Haiku 4.5 (extraction/scoring) + Claude Sonnet 4.6 (letter generation)
- **OCR:** Sarvam Vision (PDFs, Indian languages) with Claude Haiku fallback
- **Payments:** Razorpay (UPI + card + netbanking)
- **Email:** Resend

## Setup

Copy `.env.example` to `.env.local` and fill in all required keys (see `CLAUDE.md` for the full list).

```bash
npm install
npm run dev        # http://localhost:3000
```

For cookie-gated routes (`/api/analyse`, `/api/generate`) to work locally without uploading a file, set `SKIP_COOKIE_CHECK=true` in `.env.local`.

## Database

Migrations are in `supabase/migrations/`. Apply them in order via the Supabase SQL editor or CLI. The `match_kb_chunks` PostgreSQL function (defined in migration 001) is required for vector search — PostgREST cannot call pgvector operators directly.

## Deploy

Push to `main`. Vercel auto-deploys. Set all env vars in the Vercel dashboard. Do NOT switch `RAZORPAY_KEY_ID` to live keys until all items in the CLAUDE_PART2.md §7 pre-live checklist are confirmed.
