import Link from "next/link";

const trustStats = [
  { value: "94.5%", label: "ombudsman resolution rate" },
  { value: "30 days", label: "insurer settlement deadline (IRDAI rule)" },
  { value: "₹5,000/day", label: "penalty for insurer non-compliance" },
  { value: "Free", label: "ombudsman filing — no lawyer needed" },
];

const steps = [
  {
    number: "01",
    heading: "Upload your rejection letter",
    body: "PDF or photo. We accept scanned copies and photos taken with your phone.",
  },
  {
    number: "02",
    heading: "AI checks IRDAI regulations",
    body: "We search our verified knowledge base of IRDAI circulars and real ombudsman awards.",
  },
  {
    number: "03",
    heading: "Download your dispute letter",
    body: "₹99. Every citation in your letter traces to a real, verified regulation.",
  },
];

export default function HomePage() {
  return (
    <main>
      {/* ── Hero ── */}
      <section className="bg-darkBase text-white">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <p className="font-mono text-[11px] tracking-widest text-ember uppercase mb-6">
            IRDAI-Verified · Free Analysis
          </p>
          <h1 className="font-serif text-4xl font-semibold leading-tight text-balance sm:text-5xl">
            Got your health insurance claim rejected?{" "}
            <span className="text-emerald-300">Find out if you can fight it.</span>
          </h1>
          <p className="mt-6 font-sans text-base text-white/70 leading-relaxed max-w-xl mx-auto">
            ClaimRight reads your rejection letter, checks it against IRDAI
            regulations, and tells you exactly where your insurer went wrong.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 rounded-lg bg-forest px-8 py-4 font-sans text-base font-semibold text-white shadow-lg hover:bg-forest/90 transition-colors"
            >
              Upload Your Rejection Letter
              <span aria-hidden>→</span>
            </Link>
            <p className="font-mono text-[11px] tracking-wide text-white/40">
              No account needed · Takes 2 minutes · Strictly confidential
            </p>
          </div>
        </div>
      </section>

      {/* ── Trust strip ── */}
      <section className="border-y border-rule bg-parchment">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {trustStats.map((stat) => (
              <div key={stat.value} className="text-center">
                <p className="font-serif text-2xl font-semibold text-forest">
                  {stat.value}
                </p>
                <p className="mt-1 font-sans text-xs text-ink/60 leading-snug">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="bg-parchment py-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="font-mono text-[11px] tracking-widest text-ember uppercase text-center mb-2">
            How it works
          </p>
          <h2 className="font-serif text-3xl font-semibold text-center text-ink mb-12">
            Three steps to a verified dispute letter
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {steps.map((step) => (
              <div
                key={step.number}
                className="rounded-xl border border-rule bg-cream p-7"
              >
                <span className="font-mono text-xs font-medium text-forest/60">
                  {step.number}
                </span>
                <h3 className="mt-3 font-serif text-lg font-semibold text-ink">
                  {step.heading}
                </h3>
                <p className="mt-2 font-sans text-sm text-ink/60 leading-relaxed">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust / anti-hallucination ── */}
      <section className="bg-darkBase py-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="font-serif text-3xl font-semibold text-white">
            Every claim is verified.{" "}
            <span className="text-emerald-300">No fabrication. Ever.</span>
          </h2>
          <p className="mt-5 font-sans text-base text-white/65 leading-relaxed">
            If we can&apos;t find the regulation in our verified knowledge base
            of IRDAI circulars and ombudsman awards, we won&apos;t make the
            claim. Your dispute letter cites only what we can prove.
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-md border border-forest/40 bg-forest/20 px-4 py-2">
            <span className="font-mono text-xs text-emerald-300">
              [IRDAI Master Circular §5.7, 29.05.2024]
            </span>
          </div>
          <p className="mt-3 font-mono text-[10px] tracking-wide text-white/30">
            Example citation — every line in your letter looks like this
          </p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-parchment py-20">
        <div className="mx-auto max-w-xl px-6 text-center">
          <h2 className="font-serif text-2xl font-semibold text-ink">
            Find out if your rejection is worth fighting
          </h2>
          <p className="mt-3 font-sans text-sm text-ink/60">
            Free analysis. ₹99 only if you want the dispute letter.
          </p>
          <Link
            href="/upload"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-forest px-8 py-4 font-sans text-base font-semibold text-white shadow-md hover:bg-forest/90 transition-colors"
          >
            Upload Your Rejection Letter
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
