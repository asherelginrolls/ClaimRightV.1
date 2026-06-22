# Ashray — Continuation Prompt (for a fresh Claude Code session)

This session delivered **Stage A** of the Ashray rebrand: a full visual + copy transformation of the
existing app into the **"Dawn Sky"** design system. This file tells the next session what's done, what
remains, which model to use, and gives self-contained prompts to continue.

---

## ✅ Done in this session (Stage A — front-end reskin)

- **Rebrand ClaimRight → Ashray** (आश्रय = shelter/refuge) across all user-facing surfaces: nav wordmark
  + Devanagari mark, footer, metadata, email subject/body display name, Razorpay `name`.
- **"Dawn Sky" design system** in `tailwind.config.ts` (sky/blue/ink/slate/sun/gold/hope/coral/rule tokens;
  no orange, mist `#F4FAFE` base — never cream) + `app/globals.css` (keyframes, reduced-motion).
- **Fonts via `next/font`** in `app/typography.ts`: **Redaction** (self-hosted, SIL OFL 1.1, in
  `app/fonts/` with `Redaction-LICENSE.txt`) for display; **IBM Plex Sans** body; **IBM Plex Mono** labels.
- **WebGL dawn-sky hero** ported from the design export → `app/components/SkyHero.tsx` (procedural fbm
  clouds + sun glow, follows cursor/device-tilt, autonomous drift, gradient + reduced-motion fallbacks).
- **Shared components:** `SkyHero`, `SkyStrip` (inner-page band — built, **not yet placed** on inner pages),
  `Wordmark` (`app/components/`).
- **All 5 screens reskinned** with rewritten plain-language premium copy: `app/page.tsx` (landing showcase),
  `app/upload/page.tsx`, `app/analysis/[caseId]/page.tsx` (hopeful score bands, named loading steps),
  `app/pay/[caseId]/page.tsx`, `app/download/[caseId]/page.tsx`. Plus `app/error.tsx`, `app/global-error.tsx`.
- **Price → ₹299** in the UI **and** the Razorpay order amount (`app/api/payment/route.ts` → `29900` paise).
  Razorpay theme color `#2C7BC0`. **No "% of claim" / "no success fee" language anywhere** (a success-fee
  tier is planned later — do not contradict it).
- Verified: `npx tsc --noEmit` = 0 errors, `next lint` = 0 warnings, dev server renders all routes with
  zero console errors; Redaction + IBM Plex + sky palette confirmed via computed styles.

### Known notes / gotchas
- **Email sending domain unchanged.** `lib/email.ts` still sends from `noreply@claimright.in` (the verified
  Resend domain) — only the display name became "Ashray". Do **not** switch to `@ashray.in` until that domain
  is verified in Resend + DNS, or delivery breaks. Same for `support@ashray.in` in the error pages (placeholder).
- `NEXT_PUBLIC_APP_URL` fallback in `lib/email.ts` is still `https://claimright.in` — set the env var on the
  new Vercel project to the real Ashray URL.
- The screenshot tool timed out in this environment (verification used snapshots + computed-style inspect).
- The worktree shares the parent repo's `node_modules`; `.claude/launch.json` points at the parent's `next` bin.

---

## ⏳ Remaining (Stage B + backend) — recommended next work

The full V3 design (`C:\Users\asher\Downloads\Ashray.html`, real content on **line 198** of that file) also
includes a **questionnaire intake**, a **0–100 score** (the backend already returns `fightabilityNumeric`),
and a multi-part **"Dispute Pack"** (one-page summary + case timeline + clause-by-clause mapping + 3
ready-to-send letters [grievance / document-request / ombudsman] + evidence checklist + filing tracker).
None of those V3-specific surfaces are built yet.

### Recommended model + effort
- **Claude Opus 4.8 (`claude-opus-4-8`), high reasoning effort** for backend wiring (Dispute Pack generation,
  questionnaire → pipeline, schema/PDF, CLAUDE.md reconciliation). `/fast` optional.
- **Claude Sonnet 4.6 (`claude-sonnet-4-6`)** is fine for mechanical screen/markup polish.

### Session prompt 1 — Stage B front-end (Sonnet 4.6 or Opus 4.8)
> Build the V3 front-end surfaces, wired to existing APIs (no backend rewrite). (1) Add a questionnaire
> intake screen at `app/start/page.tsx`: insurer dropdown, rejected/delayed toggle, rejection reason (the 7
> reasons in the `REASONS` map in `Ashray.html` line 198), amount, days-since, months-of-cover slider; show
> an instant hopeful 0–100 preview using that file's client `compute()`, then route into the existing
> `/upload → /analysis` flow. (2) On `app/download/[caseId]/page.tsx`, render the full Dispute Pack layout
> (summary + timeline + clause mapping + 3 letter tabs with copy buttons + evidence checklist + filing tracker)
> composed from case data + the existing generated letter, porting `templates()`, `checklist`, `tracker` from
> `Ashray.html`. (3) Place `app/components/SkyStrip.tsx` at the top of each inner page for brand continuity.
> Keep the Dawn Sky tokens; TypeScript only, no `any`; end with clean `npx tsc --noEmit` + `next lint`.

### Session prompt 2 — Backend wiring (Opus 4.8, high effort)
> Wire the V3 surfaces to the backend without weakening the citation-gated pipeline (sacred; never lower the
> 0.65 threshold). (1) Accept questionnaire answers as analysis hints into `/api/analyse`. (2) Extend dispute
> generation to produce the multi-part Dispute Pack (3 letters + clause map + checklist + tracker) in
> `lib/generation.ts` + `lib/pdf.ts`, every paragraph still ending in its source citation. (3) Add any new
> case fields to the Supabase schema + `types/case.ts`. TypeScript only; clean `tsc`/`lint`.

### Session prompt 3 — Reconcile source-of-truth (Opus 4.8)
> Update `CLAUDE.md` and `README.md` to match shipped reality: brand = Ashray, price ₹299, 0–100 score,
> questionnaire intake, Dispute Pack. Verify `ashray.in` in Resend + set `NEXT_PUBLIC_APP_URL` before switching
> the email sending domain off `claimright.in`.

### Reference pointers
- Design tokens: `tailwind.config.ts`. Shader already ported: `app/components/SkyHero.tsx`.
- `REASONS` map, `templates()`, `checklist`, `tracker`, `compute()`: in `C:\Users\asher\Downloads\Ashray.html`,
  the page logic on **line 198** (extract with a tag-stripping pass; it's a single minified line).
- YC design principles: the three docs in `C:\Users\asher\Downloads\ClaimRight Design\YC Design Review Instructions\`.
