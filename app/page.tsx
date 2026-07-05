import Link from "next/link";
import SkyHero from "./components/SkyHero";

const trustStats = [
  {
    value: "94.5%",
    label:
      "of complaints taken to the insurance ombudsman were resolved last year — 52,575 cases (FY 2023–24).",
  },
  {
    value: "₹26,037 Cr",
    label:
      "in health claims were rejected or disallowed by Indian insurers in a single year.",
  },
  {
    value: "Under 1%",
    label:
      "of people whose claim is rejected ever push back. Insurers count on your silence.",
  },
];

const steps = [
  {
    number: "01",
    heading: "Show us the letter",
    body: "Upload your rejection letter — a PDF, a photo, even a WhatsApp screenshot. We read it for you. No forms to fill in.",
  },
  {
    number: "02",
    heading: "We check it against the rules",
    body: "Your case is matched to IRDAI regulations and real decisions from the insurance ombudsman. Every point we make traces back to an official source.",
  },
  {
    number: "03",
    heading: "You get a clear plan",
    body: "A plain-English read on how strong your case is, plus a ready-to-send letter that does the arguing for you — in proper, formal language.",
  },
];

export default function HomePage() {
  return (
    <main>
      {/* ── Hero ── */}
      <SkyHero className="flex min-h-[86vh] items-center justify-center px-6">
        <div className="mx-auto max-w-3xl py-24 text-center">
          <p className="mb-6 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-blue-deep">
            For India&apos;s health policyholders
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink-deep text-balance sm:text-6xl">
            They said no.
            <br />
            <span className="text-blue">This isn&apos;t where it ends.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-xl font-sans text-lg leading-relaxed text-ink/80">
            Your health insurance claim was rejected. Most rejections can be challenged — but
            almost no one does. Show Ashray your rejection letter and, in about five minutes,
            for free, we&apos;ll tell you in plain English whether you can fight it — and
            exactly what to do next.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 rounded-full bg-blue px-8 py-4 font-sans text-base font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep"
            >
              Check if my claim is fightable
              <span aria-hidden>→</span>
            </Link>
            <p className="font-mono text-[11px] tracking-wide text-slate-muted">
              Free · about 5 minutes · no sign-up needed
            </p>
          </div>
        </div>
      </SkyHero>

      {/* ── Trust strip ── */}
      <section className="border-y border-rule bg-paper">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <div className="grid gap-10 sm:grid-cols-3">
            {trustStats.map((stat) => (
              <div key={stat.value} className="text-center sm:text-left">
                <p className="font-display text-4xl font-semibold text-ink-deep">{stat.value}</p>
                <p className="mt-2 font-sans text-sm leading-relaxed text-slate">{stat.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center font-mono text-[10px] tracking-wide text-slate-faint sm:text-left">
            Sources: IRDAI Annual Report FY 2023–24 · Insurance Ombudsman Annual Report FY 2023–24
          </p>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="bg-mist py-24">
        <div className="mx-auto max-w-5xl px-6">
          <p className="mb-3 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-blue">
            How it works
          </p>
          <h2 className="mx-auto max-w-2xl text-center font-display text-3xl font-semibold text-ink-deep sm:text-4xl">
            Three steps. About five minutes. No lawyer.
          </h2>
          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {steps.map((step) => (
              <div
                key={step.number}
                className="rounded-2xl border border-rule bg-paper p-7 shadow-lift"
              >
                <span className="font-mono text-sm font-semibold text-blue/70">{step.number}</span>
                <h3 className="mt-4 font-display text-xl font-semibold text-ink-deep">
                  {step.heading}
                </h3>
                <p className="mt-2.5 font-sans text-sm leading-relaxed text-slate">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built on proof (anti-hallucination) ── */}
      <section className="bg-navy py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-sun">
            Built on proof, not guesses
          </p>
          <h2 className="font-display text-3xl font-semibold leading-tight text-white sm:text-4xl">
            Every finding traces to a real rule.
            <br />
            <span className="text-sky">Nothing invented.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl font-sans text-base leading-relaxed text-sky/80">
            Most AI tools make things up. Ashray won&apos;t. If we can&apos;t point to an actual
            IRDAI circular or ombudsman ruling behind a point, we don&apos;t make it — and we tell
            you so, plainly.
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5">
            <span className="font-mono text-xs text-sky">
              [IRDAI Master Circular on Health Insurance · 29.05.2024 · §5]
            </span>
          </div>
          <p className="mt-3 font-mono text-[10px] tracking-wide text-sky/40">
            Every line in your letter is backed like this
          </p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-mist py-24">
        <div className="mx-auto max-w-xl px-6 text-center">
          <h2 className="font-display text-3xl font-semibold text-ink-deep sm:text-4xl">
            Find out where you stand — today.
          </h2>
          <p className="mt-3 font-sans text-base text-slate">
            It&apos;s free to check, and it takes about five minutes.
          </p>
          <Link
            href="/upload"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-blue px-8 py-4 font-sans text-base font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep"
          >
            Check if my claim is fightable
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
