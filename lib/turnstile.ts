interface TurnstileVerifyResponse {
  success: boolean
  'error-codes'?: string[]
}

// Returns true when TURNSTILE_SECRET_KEY is not set (dev bypass).
// In production, verifies the token with Cloudflare's siteverify endpoint.
export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }).toString(),
      signal: AbortSignal.timeout(10_000),
    })
    const data = (await res.json()) as TurnstileVerifyResponse
    return data.success === true
  } catch {
    return false
  }
}
