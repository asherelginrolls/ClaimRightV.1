import localFont from 'next/font/local'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'

// Redaction (MCKL, SIL OFL 1.1) — newspaper/legal display face, self-hosted.
// `display` weight is the clean cut; `decay` is Redaction 35, a lightly
// degraded cut used sparingly as a "storm → clarity" storytelling accent.
export const redaction = localFont({
  src: [
    { path: './fonts/Redaction-Regular.woff', weight: '400', style: 'normal' },
    { path: './fonts/Redaction-Bold.woff', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
  fallback: ['Newsreader', 'Georgia', 'Times New Roman', 'serif'],
})

export const redactionDecay = localFont({
  src: './fonts/Redaction35-Regular.woff',
  variable: '--font-decay',
  display: 'swap',
  fallback: ['Newsreader', 'Georgia', 'serif'],
})

// IBM Plex Sans — calm, government-trust body/UI face.
export const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

// IBM Plex Mono — official register for citations, labels, kickers.
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})
