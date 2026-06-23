// Lightweight NextRequest doubles. The route handlers only ever touch
// `request.url`, `request.headers.get(...)`, `request.json()` and
// `request.formData()`, so we implement exactly those rather than constructing
// a real multipart NextRequest (which would couple tests to undici internals).

import type { NextRequest } from 'next/server'

interface RequestParts {
  url?: string
  headers?: Record<string, string>
  json?: () => Promise<unknown>
  formData?: () => Promise<FormData>
}

export function makeRequest(parts: RequestParts = {}): NextRequest {
  const headers = parts.headers ?? {}
  const req = {
    url: parts.url ?? 'http://localhost/api/test',
    headers: {
      get: (name: string): string | null => headers[name.toLowerCase()] ?? null,
    },
    json:
      parts.json ??
      (async () => {
        throw new SyntaxError('Unexpected end of JSON input')
      }),
    formData:
      parts.formData ??
      (async () => {
        throw new Error('no form data')
      }),
  }
  return req as unknown as NextRequest
}

/** POST request whose JSON body is `body`. */
export function jsonRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return makeRequest({ headers, json: async () => body })
}

/** POST request whose `.json()` rejects — simulates a malformed body. */
export function badJsonRequest(headers: Record<string, string> = {}): NextRequest {
  return makeRequest({
    headers,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON')
    },
  })
}

/** GET request with caseId (or arbitrary) query params. */
export function getRequest(
  params: Record<string, string> = {},
  headers: Record<string, string> = {}
): NextRequest {
  const qs = new URLSearchParams(params).toString()
  return makeRequest({ url: `http://localhost/api/test${qs ? `?${qs}` : ''}`, headers })
}
