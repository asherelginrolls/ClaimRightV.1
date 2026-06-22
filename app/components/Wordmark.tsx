import Link from 'next/link'

// Ashray (आश्रय = shelter / refuge) — a small sun-behind-cloud mark + the
// name in Redaction, with the Devanagari spelling in gold. The mark is the
// whole brand promise: a calm sun emerging from cloud.
export function SunCloudMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="wm-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFD9A8" />
          <stop offset="1" stopColor="#FFCB52" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="13" r="7.5" fill="url(#wm-sun)" />
      <path
        d="M7 22.5c-2.2 0-4-1.6-4-3.7 0-2 1.7-3.6 3.8-3.6.3 0 .6 0 .9.1C8.3 12.7 10.4 11 13 11c2.7 0 5 1.9 5.5 4.4.4-.1.8-.2 1.2-.2 2.4 0 4.3 1.8 4.3 4s-1.9 3.3-4.3 3.3H7z"
        fill="#FFFFFF"
        stroke="#D8E8F4"
        strokeWidth="1"
      />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`}>
      <SunCloudMark className="h-7 w-7 transition-transform group-hover:-translate-y-0.5" />
      <span className="flex items-baseline gap-2">
        <span className="font-display text-2xl font-semibold tracking-tight text-ink-deep">
          Ashray
        </span>
        <span className="mark-devanagari text-sm font-medium text-gold-ink" lang="hi">
          आश्रय
        </span>
      </span>
    </Link>
  )
}
