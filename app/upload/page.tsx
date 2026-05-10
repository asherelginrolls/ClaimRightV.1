'use client'

import { useRef, useState, DragEvent, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_BYTES = 10 * 1024 * 1024

export default function UploadPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [email, setEmail] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function validateAndSetFile(f: File) {
    setError(null)
    if (!ALLOWED_TYPES.includes(f.type)) {
      setError('Only PDF, JPG, and PNG files are accepted.')
      return
    }
    if (f.size > MAX_BYTES) {
      setError('File is too large. Maximum size is 10 MB.')
      return
    }
    setFile(f)
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) validateAndSetFile(dropped)
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) validateAndSetFile(selected)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Please select a file to upload.')
      return
    }
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('email', email.trim())

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

  return (
    <>
      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-darkBase/95">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="h-10 w-10 rounded-full border-4 border-forest border-t-emerald-300 animate-spin" />
            <p className="font-serif text-xl text-white">
              Reading your rejection letter...
            </p>
            <p className="font-mono text-xs text-white/50 tracking-wide">
              Extracting facts · Running OCR · Checking IRDAI regulations
            </p>
          </div>
        </div>
      )}

      <main className="min-h-[calc(100vh-8rem)] bg-parchment py-14 px-6">
        <div className="mx-auto max-w-lg">
          {/* Back link */}
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
            Upload Your Rejection Letter
          </h1>
          <p className="mt-2 font-sans text-sm text-ink/60 leading-relaxed">
            We&apos;ll analyse it against IRDAI regulations and score your case for free.
          </p>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
            {/* Drop zone */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                isDragging
                  ? 'border-forest bg-forest/5'
                  : file
                  ? 'border-forest/40 bg-cream'
                  : 'border-rule bg-cream hover:border-forest/30'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={onFileChange}
              />

              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest/10 text-forest">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="font-sans text-sm font-medium text-forest">
                    {file.name}
                  </p>
                  <p className="font-mono text-xs text-ink/40">
                    {formatBytes(file.size)} · Click to change
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rule text-ink/40">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-sans text-sm font-medium text-ink">
                      Drag your rejection letter here, or{' '}
                      <span className="text-forest underline underline-offset-2">click to browse</span>
                    </p>
                    <p className="mt-1 font-mono text-xs text-ink/40">
                      PDF · JPG · PNG · Max 10 MB
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Privacy notice */}
            <div className="rounded-lg border border-ember/20 bg-ember/5 px-4 py-3">
              <p className="font-mono text-[11px] leading-relaxed text-ink/60">
                <span className="font-medium text-ember">Privacy:</span>{' '}
                Do not include your Aadhaar number, phone number, or policy number.
                Your document is analysed by AI and not stored beyond what&apos;s
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
