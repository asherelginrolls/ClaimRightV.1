import { Redis } from '@upstash/redis'

// Returns a real Upstash Redis client when env vars are present,
// or a null stub so callers can safely check before using.
function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

export const redis = createRedisClient()
