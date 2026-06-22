import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { redaction, redactionDecay, plexSans, plexMono } from "./typography";
import { Wordmark } from "./components/Wordmark";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ashray — Your health claim was rejected. You still have options.",
  description:
    "Ashray reads your health insurance rejection letter, checks it against IRDAI rules and real ombudsman rulings, and tells you plainly whether you can fight it — and exactly what to do next.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${redaction.variable} ${redactionDecay.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="min-h-screen bg-mist font-sans text-ink antialiased">
        <header className="sticky top-0 z-50 border-b border-rule/80 bg-paper/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
            <Wordmark />
            <Link
              href="/upload"
              className="rounded-full border border-rule-strong bg-paper px-4 py-2 font-sans text-sm font-semibold text-blue-deep shadow-sm transition-colors hover:border-blue/40 hover:text-blue"
            >
              Check my claim →
            </Link>
          </div>
        </header>

        {children}

        <footer className="border-t border-rule bg-paper">
          <div className="mx-auto max-w-6xl px-6 py-10 text-center">
            <p className="font-mono text-[11px] tracking-[0.18em] text-slate-muted uppercase">
              Ashray · आश्रय · Built in India · 2026
            </p>
            <p className="mt-2 font-mono text-[11px] tracking-[0.14em] text-slate-faint uppercase">
              Not a law firm · Informational tool · Not legal advice
            </p>
          </div>
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
