import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'

// Next.js does NOT override system env vars with .env.local values.
// The Claude desktop app (Claude Code) sets ANTHROPIC_API_KEY="" in the
// system environment, which shadows the key in .env.local.
// This function reads .env.local directly as a fallback so the correct key
// is always used regardless of system env state.
function readKeyFromEnvLocal(keyName: string): string | undefined {
  try {
    const content = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith(keyName + '=') && !trimmed.startsWith('#')) {
        return trimmed.slice(keyName.length + 1) || undefined
      }
    }
  } catch {
    // file not found or unreadable — fall through
  }
  return undefined
}

// Lazy singleton — initialized on first call to ensure env is fully loaded.
let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY || readKeyFromEnvLocal('ANTHROPIC_API_KEY')
    _client = new Anthropic({ apiKey, timeout: 30000 })
  }
  return _client
}

// Convenience aliases used throughout the codebase
export const haiku = { get messages() { return getAnthropicClient().messages } }
export const sonnet = haiku
