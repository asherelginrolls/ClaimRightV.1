// Simple but effective rate limiting for MVP
// Uses in-memory Map — resets on serverless cold start (intentional for MVP)
// Good enough for MVP; upgrade to Redis/Upstash in production

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export function rateLimit(
  identifier: string,
  options: { maxRequests: number; windowMs: number }
): { success: boolean; remaining: number } {
  const now = Date.now()
  const entry = store.get(identifier)

  if (!entry || now > entry.resetAt) {
    store.set(identifier, { count: 1, resetAt: now + options.windowMs })
    return { success: true, remaining: options.maxRequests - 1 }
  }

  if (entry.count >= options.maxRequests) {
    return { success: false, remaining: 0 }
  }

  entry.count++
  return { success: true, remaining: options.maxRequests - entry.count }
}
