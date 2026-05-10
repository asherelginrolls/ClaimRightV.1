import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, type Database } from '@/lib/supabase'
import { randomUUID } from 'crypto'
import type { UploadResponse, ApiError } from '@/types/api'

type CaseInsert = Database['public']['Tables']['cases']['Insert']

// Simple in-memory rate limiter — resets on cold start (intentional for MVP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 5) return false
  entry.count++
  return true
}

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(
  request: NextRequest
): Promise<NextResponse<UploadResponse | ApiError>> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute before trying again.' },
      { status: 429 }
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const email = formData.get('email') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
    }

    // Server-side email format validation
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Only PDF, JPG, and PNG files are accepted.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'File is too large. Maximum size is 10 MB.' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const caseId = randomUUID()

    const rawExt = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const ext = ALLOWED_TYPES.has(file.type)
      ? rawExt
      : file.type === 'application/pdf'
        ? 'pdf'
        : file.type === 'image/png'
          ? 'png'
          : 'jpg'
    const storagePath = `${caseId}/rejection-letter.${ext}`

    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, { contentType: file.type })

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    const newCase: CaseInsert = {
      id: caseId,
      email: email ?? null,
      status: 'uploaded',
      document_path: storagePath,
    }
    // Type cast needed: supabase-js generic resolution issue with custom Database types
    // (same pattern as lib/retrieval.ts rpc() call)
    const { error: caseError } = await (
      supabase.from('cases').insert as unknown as (
        values: CaseInsert
      ) => Promise<{ data: null; error: { message: string } | null }>
    )(newCase)

    if (caseError) {
      throw new Error(`Case creation failed: ${caseError.message}`)
    }

    return NextResponse.json({ caseId, message: 'Document uploaded. Redirecting to analysis...' })
  } catch (error) {
    console.error('[upload] Error:', error)
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 }
    )
  }
}
