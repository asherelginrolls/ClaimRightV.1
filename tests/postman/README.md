# ClaimRight — Postman smoke collection

A hand-clickable collection that walks the public API end-to-end. It is for
**manual** verification only — the authoritative automated coverage lives in the
Vitest suite (`npm test`). Nothing here runs in CI.

## What's in it

`claimright.postman_collection.json` has one request per public route, in flow
order:

1. **Upload** — `POST /api/upload` (multipart) → returns a `caseId`
2. **Analyse** — `GET /api/analyse?caseId=…` → fightability band + numeric score
3. **Create payment order** — `POST /api/payment` → Razorpay `orderId` (TEST mode)
4. **Verify payment** — `POST /api/payment/verify` → flips the case to `paid`
5. **Generate** — `POST /api/generate` → citation-gated dispute letter (403 unless paid)
6. **Download** — `GET /api/download/:caseId` → the generated PDF
7. **Admin: record outcome** — `POST /api/admin/outcome` (Bearer `ADMIN_SECRET`)

## How to run it

1. Start the app locally:
   ```bash
   npm run dev
   ```
   The collection defaults `baseUrl` to `http://localhost:3000`.

2. In Postman: **Import** → select `tests/postman/claimright.postman_collection.json`.

3. Open the collection's **Variables** tab and set as you go:
   | Variable | When to set it |
   |----------|----------------|
   | `baseUrl` | Change only if your dev server isn't on `:3000` |
   | `caseId` | Paste from the **Upload** response |
   | `orderId` | Paste from the **Create payment order** response |
   | `paymentId`, `signature` | From the Razorpay TEST checkout callback |
   | `adminSecret` | Your `ADMIN_SECRET` env value (admin route only) |

4. Run the requests **top to bottom**. Request 1 produces the `caseId` every
   later request needs.

## Notes

- **Files:** the Upload request has a `files` form field of type *file* — click
  it and choose a real rejection-letter PDF/JPG/PNG before sending.
- **Turnstile:** leave `turnstile_token` blank in dev; the check is skipped when
  `TURNSTILE_SECRET_KEY` is unset.
- **Payment:** steps 3–5 need Razorpay **TEST** keys configured in `.env.local`.
  `paymentId`/`signature` come from the Razorpay TEST checkout widget, not from
  this collection.
- **Generate** returns **403** until the case is `paid` — that gate is
  intentional (see `CLAUDE_PART2.md §1`).
