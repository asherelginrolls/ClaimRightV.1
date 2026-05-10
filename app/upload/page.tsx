'use client'

import { useRef, useState, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { DocType } from '@/types/case'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_BYTES = 10 * 1024 * 1024

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
    hint: 'The letter from your insurer denying your claim',
    required: true,
  },
  {
    docType: 'policy_document',
    label: 'Policy Document',
    hint: 'Certificate of insurance or policy schedule',
    required: false,
  },
  {
    docType: 'hospital_bills',
    label: 'Hospital Bills',
    hint: 'Final invoice or itemised bill from hospital',
    required: false,
  },
  {
    docType: 'discharge_summary',
    label: 'Discharge Summary',
    hint: 'Medical records or discharge summary from treating hospital',
    required: false,
  },
  {
    docType: 'prior_correspondence',
    label: 'Prior Correspondence',
    hint: 'Emails or GRO response from insurer',
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
      onChange(config.docType, null, 'File is too large. Maximum size is 10 MB.')
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
        <span className="font-mono text-xs font-medium tracking-wide text-ink/70 uppercase">
          {config.label}
        </span>
        {isRequired ? (
          <span className="font-mono text-[10px] text-ember font-semibold uppercase tracking-wide">
            Required
          </span>
        ) : (
          <span className="font-mono text-[10px] text-ink/35 uppercase tracking-wide">
            Optional
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`relative w-full rounded-lg border px-4 py-3 text-left transition-colors ${
          slotError
            ? 'border-red-300 bg-red-50'
            : hasFile
            ? 'border-forest/40 bg-cream'
            : isRequired
            ? 'border-dashed border-rule bg-cream hover:border-forest/30'
            : 'border-dashed border-rule/60 bg-cream/60 hover:border-forest/20'
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
            <div className="flex items-center gap-2 min-w-0">
              <div className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-forest/10 text-forest">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="font-sans text-sm font-medium text-forest truncate">{file!.name}</p>
                <p className="font-mono text-[10px] text-ink/40">{formatBytes(file!.size)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="shrink-0 rounded p-1 text-ink/30 hover:text-red-500 transition-colors"
              aria-label="Remove file"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-full ${isRequired ? 'bg-rule text-ink/50' : 'bg-rule/60 text-ink/30'}`}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div>
              <p className={`font-sans text-sm ${isRequired ? 'text-ink' : 'text-ink/50'}`}>
                {config.hint}
              </p>
              <p className="font-mono text-[10px] text-ink/30 mt-0.5">PDF · JPG · PNG · Max 10 MB</p>
            </div>
          </div>
        )}
      </button>

      {slotError && (
        <p className="font-sans text-xs text-red-600">{slotError}</p>
      )}
    </div>
  )
}

export default function UploadPage() {
  const router = useRouter()

  const [files, setFiles] = useState<Partial<Record<DocType, File>>>({})
  const [slotErrors, setSlotErrors] = useState<Partial<Record<DocType, string>>>({})
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
      setError('Please upload your rejection letter — it is required.')
      return
    }
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    if (Object.values(slotErrors).some(Boolean)) {
      setError('Please fix the file errors above before submitting.')
      return
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

      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json() as { caseId?: string; error?: string }

      if (!res.ok || !data.caseId) {
        setError(data.error ?? 'Upload failed. Please try again.')
        setLoading(false)
        return
      }

      router.push(`/analysis/${data.caseId}`)
    } catch {
      setError('Upload failed. Please check your connection and try again.')
      setLoading(false)
    }
  }

  const uploadedCount = Object.keys(files).length

  return (
    <>
      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-darkBase/95">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="h-10 w-10 rounded-full border-4 border-forest border-t-emerald-300 animate-spin" />
            <p className="font-serif text-xl text-white">
              Reading your documents...
            </p>
            <p className="font-mono text-xs text-white/50 tracking-wide">
              Extracting facts · Running OCR · Checking IRDAI regulations
            </p>
          </div>
        </div>
      )}

      <main className="min-h-[calc(100vh-8rem)] bg-parchment py-14 px-6">
        <div className="mx-auto max-w-lg">
          <Link
            href="/"
            className="inline-flex items-center gap-1 font-mono text-xs text-ink/50 hover:text-ink transition-colors mb-8"
          >
            ← Back
          </Link>

          <p className="font-mono text-[11px] tracking-widest text-ember uppercase mb-2">
            Step 1 of 2
          </p>
          <h1 className="font-serif text-3xl font-semibold text-ink">
            Upload Your Documents
          </h1>
          <p className="mt-2 font-sans text-sm text-ink/60 leading-relaxed">
            Upload your rejection letter and any supporting documents. More context means a stronger dispute letter.
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
              <p className="font-mono text-[11px] text-forest tracking-wide">
                {uploadedCount} document{uploadedCount > 1 ? 's' : ''} ready to upload
              </p>
            )}

            {/* Privacy notice */}
            <div className="rounded-lg border border-ember/20 bg-ember/5 px-4 py-3">
              <p className="font-mono text-[11px] leading-relaxed text-ink/60">
                <span className="font-medium text-ember">Privacy:</span>{' '}
                Do not include your Aadhaar number or phone number.
                Documents are analysed by AI and not stored beyond what&apos;s
                needed to generate your dispute letter.
              </p>
            </div>

            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="font-mono text-xs font-medium tracking-wide text-ink/70 uppercase"
              >
                Your email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="rounded-lg border border-rule bg-cream px-4 py-3 font-sans text-sm text-ink placeholder:text-ink/30 focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/10"
              />
              <p className="font-sans text-xs text-ink/40">
                We&apos;ll send your dispute letter here after payment.
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
                <p className="font-sans text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-lg bg-forest px-6 py-4 font-sans text-base font-semibold text-white shadow-md transition-colors hover:bg-forest/90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  Analyse My Case
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
