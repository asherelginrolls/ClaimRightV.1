'use client'

import { useRef, useState, useEffect, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { DocType } from '@/types/case'

declare global {
  interface Window {
    turnstile?: {
      getResponse: (widgetId?: string) => string | undefined
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_BYTES = 10 * 1024 * 1024
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

interface SlotConfig {
  docType: DocType
  label: string
  hint: string
  required: boolean
}

const SLOTS: SlotConfig[] = [
  {
    docType: 'rejection_letter',
    label: 'Rejection / Repudiation Letter',
    hint: 'The letter from your insurer saying no — this one matters most',
    required: true,
  },
  {
    docType: 'policy_document',
    label: 'Policy Document',
    hint: 'Your policy schedule or certificate — sharpens the result',
    required: false,
  },
  {
    docType: 'hospital_bills',
    label: 'Hospital Bills',
    hint: 'Final invoice or itemised bill from the hospital',
    required: false,
  },
  {
    docType: 'discharge_summary',
    label: 'Discharge Summary',
    hint: 'Medical records or discharge summary from the hospital',
    required: false,
  },
  {
    docType: 'prior_correspondence',
    label: 'Earlier Emails / Replies',
    hint: 'Any back-and-forth or GRO reply from your insurer',
    required: false,
  },
]

interface FileSlotProps {
  config: SlotConfig
  file: File | null
  slotError: string | null
  onChange: (docType: DocType, file: File | null, err: string | null) => void
}

function FileSlot({ config, file, slotError, onChange }: FileSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    if (!selected) return
    if (!ALLOWED_TYPES.includes(selected.type)) {
      onChange(config.docType, null, 'Only PDF, JPG, and PNG files are accepted.')
      return
    }
    if (selected.size > MAX_BYTES) {
      onChange(config.docType, null, 'That file is over 10 MB. Please upload a smaller one.')
      return
    }
    onChange(config.docType, selected, null)
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation()
    onChange(config.docType, null, null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const isRequired = config.required
  const hasFile = file !== null

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-xs font-medium uppercase tracking-wide text-slate">
          {config.label}
        </span>
        {isRequired ? (
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-blue">
            Required
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wide text-slate-faint">
            Optional
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`relative w-full rounded-xl border px-4 py-3.5 text-left transition-colors ${
          slotError
            ? 'border-coral bg-coral/10'
            : hasFile
            ? 'border-hope/40 bg-hope-soft/10'
            : isRequired
            ? 'border-dashed border-rule-strong bg-sky-tint/50 hover:border-blue/40'
            : 'border-dashed border-rule bg-paper hover:border-blue/30'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={handleChange}
        />

        {hasFile ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hope/10 text-hope">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="truncate font-sans text-sm font-medium text-ink">{file!.name}</p>
                <p className="font-mono text-[10px] text-slate-faint">{formatBytes(file!.size)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="shrink-0 rounded p-1 text-slate-faint transition-colors hover:text-coral-deep"
              aria-label="Remove file"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isRequired ? 'bg-sky/50 text-blue-deep' : 'bg-rule text-slate-faint'}`}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div>
              <p className={`font-sans text-sm ${isRequired ? 'text-ink' : 'text-slate-muted'}`}>
                {config.hint}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-slate-faint">PDF · JPG · PNG · up to 10 MB</p>
            </div>
          </div>
        )}
      </button>

      {slotError && <p className="font-sans text-xs text-coral-deep">{slotError}</p>}
    </div>
  )
}

export default function UploadPage() {
  const router = useRouter()
  const turnstileContainerRef = useRef<HTMLDivElement>(null)

  const [files, setFiles] = useState<Partial<Record<DocType, File>>>({})
  const [slotErrors, setSlotErrors] = useState<Partial<Record<DocType, string>>>({})
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Load Turnstile script once when site key is configured
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return

    const existing = document.getElementById('cf-turnstile-script')
    if (existing) return

    const script = document.createElement('script')
    script.id = 'cf-turnstile-script'
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  }, [])

  function handleSlotChange(docType: DocType, file: File | null, err: string | null) {
    setFiles(prev => {
      const next = { ...prev }
      if (file) next[docType] = file
      else delete next[docType]
      return next
    })
    setSlotErrors(prev => {
      const next = { ...prev }
      if (err) next[docType] = err
      else delete next[docType]
      return next
    })
    setError(null)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!files.rejection_letter) {
      setError("Please add your rejection letter — it's the one we really need.")
      return
    }
    if (!email.trim()) {
      setError('Please add your email so we can send you the result.')
      return
    }
    if (Object.values(slotErrors).some(Boolean)) {
      setError('Please fix the file problems above before continuing.')
      return
    }

    // Turnstile check — only enforced when site key is configured
    if (TURNSTILE_SITE_KEY) {
      const token = window.turnstile?.getResponse()
      if (!token) {
        setError('Please complete the quick security check below.')
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      const fd = new FormData()
      fd.append('email', email.trim())

      for (const slot of SLOTS) {
        const file = files[slot.docType]
        if (file) {
          fd.append('files', file)
          fd.append('doc_types', slot.docType)
        }
      }

      // Attach Turnstile token if available
      if (TURNSTILE_SITE_KEY) {
        const token = window.turnstile?.getResponse() ?? ''
        fd.append('turnstile_token', token)
      }

      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json() as { caseId?: string; error?: string }

      if (!res.ok || !data.caseId) {
        setError(data.error ?? 'Something went wrong uploading. Please try again.')
        window.turnstile?.reset()
        setLoading(false)
        return
      }

      router.push(`/analysis/${data.caseId}`)
    } catch {
      setError("We couldn't reach the server. Please check your connection and try again.")
      window.turnstile?.reset()
      setLoading(false)
    }
  }

  const uploadedCount = Object.keys(files).length

  return (
    <>
      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-navy/95 px-6">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="h-12 w-12 animate-sunpulse rounded-full bg-sun shadow-glow" />
            <p className="font-display text-2xl text-white">Securing your documents…</p>
            <p className="font-mono text-xs tracking-wide text-sky/60">
              Encrypting · Uploading · Getting your case ready
            </p>
          </div>
        </div>
      )}

      <main className="min-h-[calc(100vh-8rem)] bg-mist px-6 py-14">
        <div className="mx-auto max-w-lg">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-1 font-mono text-xs text-slate-muted transition-colors hover:text-ink"
          >
            ← Back
          </Link>

          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-blue">
            Step 1 of 2 · Your documents
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink-deep sm:text-4xl">
            Show us what happened.
          </h1>
          <p className="mt-3 font-sans text-base leading-relaxed text-slate">
            You&apos;re in the right place. Add your rejection letter to begin — anything else you
            have makes the result sharper, but the letter alone is enough to start.
          </p>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
            {/* Document slots */}
            <div className="flex flex-col gap-3">
              {SLOTS.map(slot => (
                <FileSlot
                  key={slot.docType}
                  config={slot}
                  file={files[slot.docType] ?? null}
                  slotError={slotErrors[slot.docType] ?? null}
                  onChange={handleSlotChange}
                />
              ))}
            </div>

            {uploadedCount > 0 && (
              <p className="font-mono text-[11px] tracking-wide text-hope">
                {uploadedCount} document{uploadedCount > 1 ? 's' : ''} ready
              </p>
            )}

            {/* Privacy notice — reassurance, not a warning */}
            <div className="rounded-xl border border-rule bg-sky-tint/50 px-4 py-3.5">
              <p className="font-sans text-[13px] leading-relaxed text-slate">
                <span className="font-semibold text-ink">Your case stays private.</span>{' '}
                We use your documents only to build your case, and we never sell your data. There&apos;s
                no need to include your Aadhaar number anywhere.
              </p>
            </div>

            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="font-mono text-xs font-medium uppercase tracking-wide text-slate">
                Where should we send your result?
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="rounded-xl border border-rule-strong bg-paper px-4 py-3 font-sans text-sm text-ink placeholder:text-slate-faint focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/15"
              />
              <p className="font-sans text-xs text-slate-muted">
                We&apos;ll email your free result here — and your dispute letter, if you want it.
              </p>
            </div>

            {/* Cloudflare Turnstile widget — hidden when site key not configured */}
            {TURNSTILE_SITE_KEY && (
              <div
                ref={turnstileContainerRef}
                className="cf-turnstile"
                data-sitekey={TURNSTILE_SITE_KEY}
                data-theme="light"
              />
            )}

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-coral bg-coral/10 px-4 py-3">
                <p className="font-sans text-sm text-coral-deep">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-full bg-blue px-6 py-4 font-sans text-base font-semibold text-white shadow-lift transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Uploading…
                </>
              ) : (
                <>
                  Read my case
                  <span aria-hidden>→</span>
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </>
  )
}
