import { redis } from './redis'

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory fallback store — resets on serverless cold start (intentional for MVP)
const memStore = new Map<string, RateLimitEntry>()

async function incrementRedis(key: string, windowMs: number): Promise<number> {
  const count = await redis!.incr(key)
  if (count === 1) {
    await redis!.pexpire(key, windowMs)
  }
  return count
}

function incrementMemory(key: string, windowMs: number, maxRequests: number): { success: boolean; remaining: number } {
  const now = Date.now()
  const entry = memStore.get(key)

  if (!entry || now > entry.resetAt) {
    memStore.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: maxRequests - 1 }
  }

  if (entry.count >= maxRequests) {
    return { success: false, remaining: 0 }
  }

  entry.count++
  return { success: true, remaining: maxRequests - entry.count }
}

export async function rateLimit(
  identifier: string,
  options: { maxRequests: number; windowMs: number },
): Promise<{ success: boolean; remaining: number }> {
  if (redis) {
    try {
      const count = await incrementRedis(identifier, options.windowMs)
      if (count > options.maxRequests) {
        return { success: false, remaining: 0 }
      }
      return { success: true, remaining: options.maxRequests - count }
    } catch {
      // Redis error — fall through to in-memory
    }
  }
  return incrementMemory(identifier, options.windowMs, options.maxRequests)
}

// Per-minute cap: 5 requests/IP/minute
// Per-day cap: 50 analyses/IP/day
export async function rateLimitUpload(ip: string): Promise<{ success: boolean; reason?: string }> {
  const [minute, day] = await Promise.all([
    rateLimit(`upload:min:${ip}`, { maxRequests: 5, windowMs: 60_000 }),
    rateLimit(`upload:day:${ip}`, { maxRequests: 50, windowMs: 24 * 60 * 60_000 }),
  ])
  if (!minute.success) return { success: false, reason: 'Too many requests. Please wait a minute before trying again.' }
  if (!day.success) return { success: false, reason: 'Daily upload limit reached. Please try again tomorrow.' }
  return { success: true }
}
