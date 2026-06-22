import type { ReactNode } from 'react'

// A thin dawn-sky band for the top of inner pages, so the brand world
// "follows along" while inner pages stay calm. Pure CSS/SVG (no WebGL) and
// deliberately quiet — gentle drift, not noise.

function Cloud({ className = '', opacity = 0.95 }: { className?: string; opacity?: number }) {
  return (
    <svg viewBox="0 0 220 90" className={className} fill="#FFFFFF" opacity={opacity} aria-hidden="true">
      <ellipse cx="110" cy="60" rx="100" ry="26" />
      <circle cx="78" cy="48" r="30" />
      <circle cx="120" cy="38" r="40" />
      <circle cx="158" cy="50" r="28" />
    </svg>
  )
}

function CloudRow() {
  return (
    <div className="relative h-full w-1/2 shrink-0">
      <Cloud className="absolute -top-2 left-[6%] w-40" opacity={0.9} />
      <Cloud className="absolute top-6 left-[42%] w-28" opacity={0.7} />
      <Cloud className="absolute -top-4 left-[74%] w-36" opacity={0.85} />
    </div>
  )
}

export default function SkyStrip({
  children,
  className = 'h-28 sm:h-32',
}: {
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={`relative isolate w-full overflow-hidden border-b border-rule bg-dawn-soft ${className}`}>
      {/* Soft rising sun */}
      <div
        className="pointer-events-none absolute left-1/2 -top-20 h-52 w-52 -translate-x-1/2 animate-sunpulse rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,203,82,0.5) 0%, rgba(255,217,168,0.25) 35%, transparent 62%)' }}
      />
      {/* Seamlessly drifting clouds */}
      <div className="absolute inset-x-0 top-0 flex h-full w-[200%] animate-drift">
        <CloudRow />
        <CloudRow />
      </div>
      {children && (
        <div className="relative z-10 mx-auto flex h-full max-w-5xl items-center px-6">
          {children}
        </div>
      )}
    </div>
  )
}
