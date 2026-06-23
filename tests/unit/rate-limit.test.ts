import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Force the offline in-memory path so the test is fully deterministic and never
// touches Upstash. (redis === null makes lib/rate-limit fall back to memStore.)
vi.mock('@/lib/redis', () => ({ redis: null }))

import { rateLimit } from '@/lib/rate-limit'

const OPTS = { maxRequests: 5, windowMs: 60_000 }

describe('rateLimit — in-memory fixed window', () => {
  it('allows 5 requests then blocks the 6th for the same identifier', async () => {
    const key = `unit:${Math.random()}`
    const results = []
    for (let i = 0; i < 5; i++) {
      results.push(await rateLimit(key, OPTS))
    }
    expect(results.every((r) => r.success)).toBe(true)
    expect(results.map((r) => r.remaining)).toEqual([4, 3, 2, 1, 0])

    const sixth = await rateLimit(key, OPTS)
    expect(sixth.success).toBe(false)
    expect(sixth.remaining).toBe(0)
  })

  it('tracks identifiers independently', async () => {
    const a = `unit:a:${Math.random()}`
    const b = `unit:b:${Math.random()}`
    for (let i = 0; i < 5; i++) await rateLimit(a, OPTS)
    expect((await rateLimit(a, OPTS)).success).toBe(false)
    // b has its own fresh budget
    expect((await rateLimit(b, OPTS)).success).toBe(true)
  })
})

describe('rateLimit — window reset', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('resets the budget after the window elapses', async () => {
    const key = `unit:reset:${Math.random()}`
    for (let i = 0; i < 5; i++) await rateLimit(key, OPTS)
    expect((await rateLimit(key, OPTS)).success).toBe(false)

    // Advance past the 60s window — the next request starts a fresh window.
    vi.advanceTimersByTime(OPTS.windowMs + 1)
    const afterReset = await rateLimit(key, OPTS)
    expect(afterReset.success).toBe(true)
    expect(afterReset.remaining).toBe(4)
  })
})
