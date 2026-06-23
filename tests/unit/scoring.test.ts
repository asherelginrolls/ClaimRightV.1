import { describe, it, expect } from 'vitest'
import {
  calculateFightabilityScore,
  computeNumericScore,
  defaultScorer,
  RuleBasedScorer,
  buildScoringFeatures,
  daysSinceRejection,
} from '@/lib/scoring'
import type { ExtractedFacts } from '@/types/api'
import type { FightabilityScore } from '@/types/case'
import { makeChunk, makeRetrieval } from '../helpers/kb'

// Tests written against the ORIGINAL rules engine (before the B1 Scorer
// refactor). They are the contract that proves the RuleBasedScorer wrapper
// introduces no behavior change — see CLAUDE.md FIGHTABILITY SCORING LOGIC.

function makeFacts(overrides: Partial<ExtractedFacts> = {}): ExtractedFacts {
  return {
    insurer: 'Test Insurer',
    claim_amount: 75000,
    rejection_date: '2026-05-01',
    rejection_reason_raw: 'Your claim has been rejected.',
    rejection_reason_category: 'other',
    documents_requested_count: null,
    policy_age_months: null,
    policy_type: 'individual',
    rejection_reason_confidence: 0.9,
    ...overrides,
  }
}

describe('calculateFightabilityScore — STRONG branches', () => {
  it("topScore >= 0.80 with chunks -> 'strong' and cites the top chunk", () => {
    const chunk = makeChunk({ similarity: 0.85, source_title: 'IRDAI MC', section_number: '5.7' })
    const retrieval = makeRetrieval({ chunks: [chunk], topScore: 0.85 })
    const { score, reasons } = calculateFightabilityScore(makeFacts(), retrieval)
    expect(score).toBe<FightabilityScore>('strong')
    expect(reasons[0].citation).toBe('IRDAI MC, §5.7')
  })

  it('builds a citation without a section marker when section_number is null', () => {
    const chunk = makeChunk({ similarity: 0.85, source_title: 'IRDAI MC', section_number: null })
    const retrieval = makeRetrieval({ chunks: [chunk], topScore: 0.85 })
    const { reasons } = calculateFightabilityScore(makeFacts(), retrieval)
    expect(reasons[0].citation).toBe('IRDAI MC')
  })

  it("documents_requested_count >= 2 -> 'strong' (piecemeal)", () => {
    const retrieval = makeRetrieval({ chunks: [], topScore: 0 })
    const { score, reasons } = calculateFightabilityScore(
      makeFacts({ rejection_reason_category: 'policy_exclusion', documents_requested_count: 3 }),
      retrieval
    )
    expect(score).toBe('strong')
    expect(reasons.some((r) => r.reason.includes('3 separate document requests'))).toBe(true)
  })

  it("category 'documentation_incomplete' -> 'strong'", () => {
    const retrieval = makeRetrieval({ chunks: [], topScore: 0 })
    const { score } = calculateFightabilityScore(
      makeFacts({ rejection_reason_category: 'documentation_incomplete' }),
      retrieval
    )
    expect(score).toBe('strong')
  })

  it("pre_existing_condition AND policy_age_months >= 60 -> 'strong' (PPOI moratorium)", () => {
    const retrieval = makeRetrieval({ chunks: [], topScore: 0 })
    const { score, reasons } = calculateFightabilityScore(
      makeFacts({ rejection_reason_category: 'pre_existing_condition', policy_age_months: 72 }),
      retrieval
    )
    expect(score).toBe('strong')
    expect(reasons[0].citation).toContain('PPOI Master Circular')
  })

  it("pre_existing_condition with policy_age_months < 60 does NOT force strong", () => {
    const retrieval = makeRetrieval({ chunks: [], topScore: 0 })
    const { score } = calculateFightabilityScore(
      makeFacts({ rejection_reason_category: 'pre_existing_condition', policy_age_months: 24 }),
      retrieval
    )
    expect(score).not.toBe('strong')
  })

  it("category 'cashless_denial' -> 'strong'", () => {
    const retrieval = makeRetrieval({ chunks: [], topScore: 0 })
    const { score } = calculateFightabilityScore(
      makeFacts({ rejection_reason_category: 'cashless_denial' }),
      retrieval
    )
    expect(score).toBe('strong')
  })
})

describe('calculateFightabilityScore — MEDIUM branches', () => {
  it("topScore in [0.65, 0.80) with chunks -> 'medium'", () => {
    const chunk = makeChunk({ similarity: 0.72 })
    const retrieval = makeRetrieval({ chunks: [chunk], topScore: 0.72 })
    const { score, reasons } = calculateFightabilityScore(makeFacts(), retrieval)
    expect(score).toBe('medium')
    expect(reasons.some((r) => r.reason.includes('potentially applicable'))).toBe(true)
  })

  it("category 'waiting_period' -> 'medium'", () => {
    const retrieval = makeRetrieval({ chunks: [], topScore: 0 })
    const { score } = calculateFightabilityScore(
      makeFacts({ rejection_reason_category: 'waiting_period' }),
      retrieval
    )
    expect(score).toBe('medium')
  })

  it("tier-2 precedent chunk >= GATING_FLOOR -> 'medium' with precedent reason", () => {
    const precedent = makeChunk({
      tier: 2,
      similarity: 0.7,
      source_title: 'Insurance Ombudsman Award 2024',
      section_number: 'Case-123',
      issuer: 'Insurance Ombudsman',
    })
    const retrieval = makeRetrieval({ chunks: [precedent], topScore: 0.7 })
    const { score, reasons } = calculateFightabilityScore(makeFacts(), retrieval)
    expect(score).toBe('medium')
    expect(reasons.some((r) => r.reason.includes('ombudsman precedent'))).toBe(true)
  })

  it('a sub-floor tier-2 chunk (< 0.65) does NOT on its own justify medium', () => {
    const precedent = makeChunk({ tier: 2, similarity: 0.6 })
    const retrieval = makeRetrieval({ chunks: [precedent], topScore: 0.6 })
    const { score } = calculateFightabilityScore(makeFacts(), retrieval)
    expect(score).toBe('low')
  })
})

describe('calculateFightabilityScore — LOW branches', () => {
  it("fraud_suspected with no matches -> 'low'", () => {
    const retrieval = makeRetrieval({ chunks: [], topScore: 0 })
    const { score, reasons } = calculateFightabilityScore(
      makeFacts({ rejection_reason_category: 'fraud_suspected' }),
      retrieval
    )
    expect(score).toBe('low')
    expect(reasons[0].reason).toContain('fraud')
    expect(reasons[0].citation).toBeNull()
  })

  it("no KB match (topScore < 0.65) -> 'low'", () => {
    const chunk = makeChunk({ similarity: 0.55 })
    const retrieval = makeRetrieval({ chunks: [chunk], topScore: 0.55 })
    const { score, reasons } = calculateFightabilityScore(makeFacts(), retrieval)
    expect(score).toBe('low')
    expect(reasons[0].reason).toContain('No directly applicable regulation')
  })
})

describe('calculateFightabilityScore — invariants', () => {
  it('reasons array never exceeds 3 items (maximal strong case)', () => {
    const chunk = makeChunk({ similarity: 0.9 })
    const retrieval = makeRetrieval({ chunks: [chunk], topScore: 0.9 })
    const { reasons } = calculateFightabilityScore(
      makeFacts({
        rejection_reason_category: 'documentation_incomplete',
        documents_requested_count: 4,
      }),
      retrieval
    )
    expect(reasons.length).toBeLessThanOrEqual(3)
  })

  it('reasons array never exceeds 3 items (maximal medium case)', () => {
    const precedent = makeChunk({ tier: 2, similarity: 0.72 })
    const retrieval = makeRetrieval({ chunks: [precedent], topScore: 0.72 })
    const { reasons } = calculateFightabilityScore(
      makeFacts({ rejection_reason_category: 'waiting_period' }),
      retrieval
    )
    expect(reasons.length).toBeLessThanOrEqual(3)
  })
})

describe('computeNumericScore — numeric must agree with band', () => {
  const BANDS: Record<FightabilityScore, [number, number]> = {
    strong: [65, 95],
    medium: [40, 64],
    low: [5, 39],
  }
  const topScores = [0, 0.55, 0.65, 0.8, 1.0]

  for (const band of Object.keys(BANDS) as FightabilityScore[]) {
    const [min, max] = BANDS[band]
    for (const topScore of topScores) {
      it(`band=${band} topScore=${topScore} stays within [${min}, ${max}]`, () => {
        const retrieval = makeRetrieval({ chunks: [], topScore })
        const numeric = computeNumericScore(retrieval, band)
        expect(numeric).toBeGreaterThanOrEqual(min)
        expect(numeric).toBeLessThanOrEqual(max)
        expect(Number.isInteger(numeric)).toBe(true)
      })
    }
  }

  it('higher topScore yields a higher (or equal) numeric within the same band', () => {
    const low = computeNumericScore(makeRetrieval({ topScore: 0.65 }), 'strong')
    const high = computeNumericScore(makeRetrieval({ topScore: 1.0 }), 'strong')
    expect(high).toBeGreaterThanOrEqual(low)
  })

  it("defaults to the 'low' band when no text band is supplied", () => {
    const numeric = computeNumericScore(makeRetrieval({ topScore: 0 }))
    expect(numeric).toBeGreaterThanOrEqual(5)
    expect(numeric).toBeLessThanOrEqual(39)
  })
})

// ── B1 refactor: RuleBasedScorer must be a no-behavior-change wrapper ─────────

describe('RuleBasedScorer (B1) — identical to the V1 functions', () => {
  const scenarios: Array<{ name: string; facts: Partial<ExtractedFacts>; topScore: number; tier: 1 | 2 }> = [
    { name: 'strong via topScore', facts: {}, topScore: 0.85, tier: 1 },
    { name: 'strong via documentation_incomplete', facts: { rejection_reason_category: 'documentation_incomplete' }, topScore: 0, tier: 1 },
    { name: 'medium via topScore band', facts: {}, topScore: 0.72, tier: 1 },
    { name: 'medium via precedent', facts: {}, topScore: 0.7, tier: 2 },
    { name: 'low via fraud', facts: { rejection_reason_category: 'fraud_suspected' }, topScore: 0, tier: 1 },
  ]

  for (const s of scenarios) {
    it(`matches calculateFightabilityScore + computeNumericScore — ${s.name}`, () => {
      const chunks = s.topScore > 0 ? [makeChunk({ similarity: s.topScore, tier: s.tier })] : []
      const retrieval = makeRetrieval({ chunks, topScore: s.topScore })
      const facts = makeFacts(s.facts)

      const expected = calculateFightabilityScore(facts, retrieval)
      const expectedNumeric = computeNumericScore(retrieval, expected.score)

      const out = defaultScorer.score(facts, retrieval)
      expect(out.score).toBe(expected.score)
      expect(out.reasons).toEqual(expected.reasons)
      expect(out.numeric).toBe(expectedNumeric)
    })
  }

  it("exposes version 'rules-v1'", () => {
    expect(defaultScorer.version).toBe('rules-v1')
    expect(new RuleBasedScorer().version).toBe('rules-v1')
  })
})

describe('buildScoringFeatures (B1) — the model-ready vector', () => {
  it('captures rule signals as flat typed fields', () => {
    const chunk = makeChunk({ tier: 2, similarity: 0.82 })
    const retrieval = makeRetrieval({ chunks: [chunk], topScore: 0.82 })
    const facts = makeFacts({
      rejection_reason_category: 'pre_existing_condition',
      documents_requested_count: 3,
      policy_age_months: 72,
      rejection_date: '2026-05-01',
    })
    const f = buildScoringFeatures(facts, retrieval, new Date('2026-05-31T00:00:00Z'))

    expect(f.topScore).toBe(0.82)
    expect(f.chunkCount).toBe(1)
    expect(f.topScoreAboveGatingFloor).toBe(true)
    expect(f.documentsRequestedCount).toBe(3)
    expect(f.documentsRequestedMultiple).toBe(true)
    expect(f.policyAgeMonths).toBe(72)
    expect(f.policyAgeOver60).toBe(true)
    expect(f.tier2PrecedentFound).toBe(true)
    expect(f.daysSinceRejection).toBe(30)
    expect(f.cat_pre_existing_condition).toBe(true)
    expect(f.cat_other).toBe(false)
  })

  it('uses -1 sentinels and false thresholds for unknown inputs', () => {
    const f = buildScoringFeatures(
      makeFacts({ documents_requested_count: null, policy_age_months: null, rejection_date: null }),
      makeRetrieval({ chunks: [], topScore: 0 })
    )
    expect(f.documentsRequestedCount).toBe(-1)
    expect(f.documentsRequestedMultiple).toBe(false)
    expect(f.policyAgeMonths).toBe(-1)
    expect(f.policyAgeOver60).toBe(false)
    expect(f.daysSinceRejection).toBe(-1)
    expect(f.tier2PrecedentFound).toBe(false)
  })
})

describe('daysSinceRejection (B1)', () => {
  it('computes whole days from a valid date', () => {
    expect(daysSinceRejection('2026-05-01', new Date('2026-05-11T00:00:00Z'))).toBe(10)
  })
  it('returns -1 for null or unparseable dates', () => {
    expect(daysSinceRejection(null)).toBe(-1)
    expect(daysSinceRejection('not-a-date')).toBe(-1)
  })
  it('returns -1 for a future rejection date', () => {
    expect(daysSinceRejection('2030-01-01', new Date('2026-05-01T00:00:00Z'))).toBe(-1)
  })
})
