import { describe, it, expect } from 'vitest'
import { expandQueryWithSynonyms } from '@/lib/synonyms'

function tokenSet(s: string): Set<string> {
  return new Set(s.split(/\s+/).filter(Boolean))
}

describe('expandQueryWithSynonyms', () => {
  it('appends the expected synonyms for a matched term', () => {
    const out = expandQueryWithSynonyms('claim repudiation dispute')
    expect(out).toContain('claim repudiation dispute') // original preserved
    expect(out).toContain('rejection denial refused repudiation') // appended expansion
  })

  it('expands multiple distinct terms in one query', () => {
    const out = expandQueryWithSynonyms('TPA pre-auth denied')
    expect(out).toContain('third party administrator TPA')
    expect(out).toContain('pre-authorization cashless authorization')
  })

  it('returns the query unchanged when nothing matches', () => {
    const q = 'generic unrelated sentence with no insurance jargon here'
    expect(expandQueryWithSynonyms(q)).toBe(q)
  })

  it('is idempotent on already-expanded input (introduces no new synonyms)', () => {
    const once = expandQueryWithSynonyms('claim repudiation dispute')
    const twice = expandQueryWithSynonyms(once)
    // Re-running over expanded text must not introduce any NEW distinct token.
    expect(tokenSet(twice)).toEqual(tokenSet(once))
  })

  it('does not mutate global regex lastIndex across calls (no flaky skips)', () => {
    // Two back-to-back calls on the same input must produce identical output —
    // guards against the /g regex lastIndex bug the impl resets for.
    const a = expandQueryWithSynonyms('GRO complaint about repudiation')
    const b = expandQueryWithSynonyms('GRO complaint about repudiation')
    expect(a).toBe(b)
  })
})
