import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ success: true, remaining: 99 })),
  rateLimitUpload: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/supabase', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstileToken: vi.fn(async () => true) }))

import { POST } from '@/app/api/upload/route'
import { createServiceClient } from '@/lib/supabase'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { createMockSupabase, type MockConfig } from '../helpers/supabase-mock'
import { makeRequest } from '../helpers/request'

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]

function fileWith(magic: number[], name: string, type: string): File {
  const buf = new Uint8Array(16)
  magic.forEach((b, i) => (buf[i] = b))
  return new File([buf], name, { type })
}

function uploadRequest(parts: {
  files?: Array<{ file: File; docType: string }>
  email?: string
  turnstile?: string
}) {
  const fd = new FormData()
  if (parts.email !== undefined) fd.append('email', parts.email)
  fd.append('turnstile_token', parts.turnstile ?? 'token')
  for (const { file, docType } of parts.files ?? []) {
    fd.append('files', file)
    fd.append('doc_types', docType)
  }
  return makeRequest({ formData: async () => fd })
}

function mockSupabase(config: MockConfig = {}) {
  const supa = createMockSupabase(config)
  vi.mocked(createServiceClient).mockReturnValue(supa as unknown as ReturnType<typeof createServiceClient>)
  return supa
}

describe('POST /api/upload', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when no files are uploaded', async () => {
    const res = await POST(uploadRequest({ files: [] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no files/i)
  })

  it('returns 400 when files and doc_types counts mismatch', async () => {
    const fd = new FormData()
    fd.append('turnstile_token', 'token')
    fd.append('files', fileWith(PDF_MAGIC, 'a.pdf', 'application/pdf'))
    // no matching doc_types entry
    const res = await POST(makeRequest({ formData: async () => fd }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/mismatched/i)
  })

  it('returns 400 when more than 5 files are uploaded', async () => {
    const files = Array.from({ length: 6 }, (_, i) => ({
      file: fileWith(PDF_MAGIC, `f${i}.pdf`, 'application/pdf'),
      docType: 'rejection_letter',
    }))
    const res = await POST(uploadRequest({ files }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/maximum 5/i)
  })

  it('returns 400 on an invalid doc_type', async () => {
    const res = await POST(
      uploadRequest({ files: [{ file: fileWith(PDF_MAGIC, 'a.pdf', 'application/pdf'), docType: 'tax_return' }] })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid doc_type/i)
  })

  it('returns 400 when no rejection_letter is present', async () => {
    const res = await POST(
      uploadRequest({ files: [{ file: fileWith(PDF_MAGIC, 'p.pdf', 'application/pdf'), docType: 'policy_document' }] })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/rejection letter is required/i)
  })

  it('returns 400 when the bot check fails', async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValueOnce(false)
    const res = await POST(
      uploadRequest({ files: [{ file: fileWith(PDF_MAGIC, 'r.pdf', 'application/pdf'), docType: 'rejection_letter' }] })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/bot check/i)
  })

  it('returns 400 on a disallowed mime type', async () => {
    const res = await POST(
      uploadRequest({ files: [{ file: fileWith(PDF_MAGIC, 'r.txt', 'text/plain'), docType: 'rejection_letter' }] })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/only pdf, jpg, and png/i)
  })

  it('returns 400 when magic bytes do not match the declared type', async () => {
    const res = await POST(
      uploadRequest({
        // declared PDF but bytes are zeros
        files: [{ file: fileWith([0, 0, 0, 0], 'fake.pdf', 'application/pdf'), docType: 'rejection_letter' }],
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/does not match its declared type/i)
  })

  it('returns 400 on an invalid email format', async () => {
    const res = await POST(
      uploadRequest({
        email: 'not-an-email',
        files: [{ file: fileWith(PDF_MAGIC, 'r.pdf', 'application/pdf'), docType: 'rejection_letter' }],
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/valid email/i)
  })

  it('happy path: uploads a valid rejection letter and returns a caseId', async () => {
    const supa = mockSupabase({
      tables: { cases: { insertError: null }, case_documents: { insertError: null } },
    })
    const res = await POST(
      uploadRequest({
        email: 'user@example.com',
        files: [{ file: fileWith(PDF_MAGIC, 'rejection.pdf', 'application/pdf'), docType: 'rejection_letter' }],
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.caseId).toBe('string')
    expect(body.message).toEqual(expect.any(String))
    // a row was written to both tables and the file went to storage
    expect(supa.__uploads.length).toBe(1)
    expect(supa.__inserts.some((i) => i.table === 'cases')).toBe(true)
    expect(supa.__inserts.some((i) => i.table === 'case_documents')).toBe(true)
  })

  it('returns a graceful 500 (no stack) when storage upload fails', async () => {
    mockSupabase({ storage: { uploadError: { message: 'bucket secret-detail exploded' } } })
    const res = await POST(
      uploadRequest({
        files: [{ file: fileWith(PDF_MAGIC, 'rejection.pdf', 'application/pdf'), docType: 'rejection_letter' }],
      })
    )
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Upload failed. Please try again.' })
    expect(JSON.stringify(body)).not.toContain('secret-detail')
  })
})
