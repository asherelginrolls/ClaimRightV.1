import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClaimRight — Fight Your Insurance Rejection",
  description:
    "AI-powered health insurance dispute co-pilot for India. Upload your rejection letter, get verified IRDAI-based grounds to fight back.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      style={{ background: "#F5F1E8" }}
    >
      <body className="min-h-screen bg-parchment text-ink">
        <nav className="border-b border-rule bg-cream">
          <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
            <a href="/" className="flex items-center gap-2">
              <span className="font-serif text-xl font-semibold text-forest">
                ClaimRight
              </span>
              <span className="font-mono text-[10px] font-medium tracking-widest text-ember uppercase">
                Beta
              </span>
            </a>
          </div>
        </nav>
        {children}
        <footer className="border-t border-rule bg-cream">
          <div className="mx-auto max-w-5xl px-6 py-8 text-center">
            <p className="font-mono text-[11px] tracking-widest text-ink/50 uppercase">
              Not a law firm · Not legal advice · IRDAI-based guidance only
            </p>
            <p className="mt-2 font-sans text-xs text-ink/40">
              © 2026 ClaimRight
            </p>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
