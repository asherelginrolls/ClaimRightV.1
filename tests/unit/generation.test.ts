import { describe, it, expect } from 'vitest'
import {
  tokenOverlapCoefficient,
  validateParagraph,
  assembleValidatedLetter,
  type CaseFacts,
  type LetterOutput,
} from '@/lib/generation'
import type { KbSearchResult } from '@/types/kb'
import { makeChunk, MASTER_CIRCULAR_TEXT, fakeUuid } from '../helpers/kb'

// The span-validation pipeline is "sacred" per CLAUDE.md §"ANTI-HALLUCINATION
// PIPELINE". CLAUDE_PART2.md §1 refines the POST-PAYMENT rule: a low-overlap
// citation backed by a REAL chunk_id is SOFTENED (status 'fail', text kept),
// and a sentence is only physically removed when its chunk_id is NOT in the
// retrieved set (a true fabrication). These tests assert that exact behavior.

function makeCounters() {
  return { total: 0, failed: 0, flagged: 0 }
}

describe('tokenOverlapCoefficient', () => {
  it('identical text -> 1.0', () => {
    const t = 'reimbursement claims settled within thirty days'
    expect(tokenOverlapCoefficient(t, t)).toBe(1)
  })

  it('disjoint text -> 0.0', () => {
    expect(tokenOverlapCoefficient('alpha bravo charlie delta', 'epsilon foxtrot golf hotel')).toBe(0)
  })

  it('partial overlap -> known value (2 of 3 = 0.667)', () => {
    // snippet tokens {apple,banana,cherry}; chunk tokens {apple,banana,dates,elder}
    const v = tokenOverlapCoefficient('apple banana cherry', 'apple banana dates elder')
    expect(v).toBeCloseTo(2 / 3, 5)
  })

  it('stopwords are removed before scoring', () => {
    // With stopwords counted this would be 2/4 = 0.5; stopwords removed -> 1.0
    expect(tokenOverlapCoefficient('the and of apple banana', 'apple banana')).toBe(1)
  })

  it('empty snippet -> 0', () => {
    expect(tokenOverlapCoefficient('', 'apple banana cherry')).toBe(0)
  })
})

describe('validateParagraph — threshold filtering', () => {
  it("overlap >= 0.70 -> status 'pass', text untouched", () => {
    const chunk = makeChunk({ content: MASTER_CIRCULAR_TEXT })
    const chunkMap = new Map<string, KbSearchResult>([[chunk.id, chunk]])
    const counters = makeCounters()
    const para = {
      text: 'The insurer made piecemeal document requests. [Source: IRDAI MC, §5.7]',
      citations: [
        {
          chunk_id: chunk.id,
          regulation_title: 'IRDAI Master Circular on Health Insurance',
          section: '5.7',
          snippet: 'prohibits insurers from making piecemeal document requests',
        },
      ],
    }
    const out = validateParagraph(para, chunkMap, counters)
    expect(out.citations[0].status).toBe('pass')
    expect(out.citations[0].overlap).toBeGreaterThanOrEqual(0.7)
    expect(out.validatedText).toBe(para.text)
    expect(counters).toEqual({ total: 1, failed: 0, flagged: 0 })
  })

  it("overlap in [0.40, 0.69] -> status 'flag' and language softened", () => {
    const chunk = makeChunk({ content: 'alpha bravo charlie delta echo foxtrot' })
    const chunkMap = new Map<string, KbSearchResult>([[chunk.id, chunk]])
    const counters = makeCounters()
    const para = {
      // 'violates' is a soften-trigger word
      text: 'The insurer violates the framework here. [Source: X, §1]',
      citations: [
        {
          chunk_id: chunk.id,
          regulation_title: 'X',
          section: '1',
          snippet: 'alpha bravo charlie xray yankee zulu', // 3 of 6 overlap -> 0.5
        },
      ],
    }
    const out = validateParagraph(para, chunkMap, counters)
    expect(out.citations[0].overlap).toBeCloseTo(0.5, 5)
    expect(out.citations[0].status).toBe('flag')
    expect(out.validatedText).toContain('may not comply with')
    expect(out.validatedText).not.toContain('violates')
    expect(counters.flagged).toBe(1)
  })

  it("overlap < 0.40 with a REAL chunk -> status 'fail', sentence softened NOT removed (CLAUDE_PART2 §1)", () => {
    const chunk = makeChunk({ content: 'alpha bravo charlie' })
    const chunkMap = new Map<string, KbSearchResult>([[chunk.id, chunk]])
    const counters = makeCounters()
    const para = {
      text: 'The insurer violates the law in this respect. [Source: X, §1]',
      citations: [
        {
          chunk_id: chunk.id,
          regulation_title: 'X',
          section: '1',
          snippet: 'xray yankee zulu omega', // 0 overlap -> fail
        },
      ],
    }
    const out = validateParagraph(para, chunkMap, counters)
    expect(out.citations[0].status).toBe('fail')
    // Softened, but the sentence + marker are retained (not a hallucinated chunk)
    expect(out.validatedText).toContain('insurer')
    expect(out.validatedText).toContain('[Source: X, §1]')
    expect(out.validatedText).toContain('may not comply with')
    expect(out.hasRemovedClaims).toBe(false)
    expect(counters.failed).toBe(1)
  })

  it('citation referencing a chunk_id NOT in the retrieved set -> sentence removed + note appended', () => {
    const realChunk = makeChunk({ content: MASTER_CIRCULAR_TEXT })
    const chunkMap = new Map<string, KbSearchResult>([[realChunk.id, realChunk]])
    const counters = makeCounters()
    const para = {
      text:
        'This rejection relies on a fabricated rule. [Source: Ghost Regulation, §9] ' +
        'Reimbursement claims shall be settled within thirty days. [Source: IRDAI MC, §5.7]',
      citations: [
        {
          chunk_id: fakeUuid('ghost'), // NOT in chunkMap -> hallucination
          regulation_title: 'Ghost Regulation',
          section: '9',
          snippet: 'this snippet references a chunk that does not exist in retrieval',
        },
        {
          chunk_id: realChunk.id,
          regulation_title: 'IRDAI Master Circular on Health Insurance',
          section: '5.7',
          snippet: 'Reimbursement claims shall be settled within thirty days',
        },
      ],
    }
    const out = validateParagraph(para, chunkMap, counters)
    expect(out.hasRemovedClaims).toBe(true)
    expect(out.validatedText).not.toContain('fabricated rule')
    expect(out.validatedText).not.toContain('Ghost Regulation')
    // The legitimate neighbouring claim + its real marker survive intact
    expect(out.validatedText).toContain('Reimbursement claims shall be settled within thirty days')
    expect(out.validatedText).toContain('[Source: IRDAI MC, §5.7]')
    expect(out.validatedText).toContain('[Note: One or more citations')
    expect(counters.failed).toBe(1)
  })
})

describe('assembleValidatedLetter — post-payment guarantee (CLAUDE_PART2 §1)', () => {
  function caseFacts(category: CaseFacts['rejectionReasonCategory'] = 'documentation_incomplete'): CaseFacts {
    return {
      insurer: 'Test Insurance Co. Ltd.',
      claimAmount: 7_500_000, // ₹75,000 in paise
      rejectionReasonRaw: 'Claim rejected for incomplete documentation.',
      rejectionReasonCategory: category,
      rejectionDate: '2026-04-01',
    }
  }

  function thinLetter(citation?: { chunk_id: string; regulation_title: string; section: string; snippet: string }): LetterOutput {
    return {
      subject_line: 'Formal Grievance — Claim Repudiation Dispute',
      salutation: 'Dear Sir/Madam,',
      body_paragraphs: [
        {
          text: 'I respectfully submit that the rejection is contrary to applicable norms. [Source: X, §1]',
          citations: citation ? [citation] : [],
        },
      ],
      closing: 'I await your reasoned response.',
      relief_sought: 'Reconsideration and full settlement.',
    }
  }

  it('drops the claim of a paragraph whose only citation is a hallucinated chunk_id', () => {
    const realChunk = makeChunk({ content: MASTER_CIRCULAR_TEXT })
    const letter: LetterOutput = {
      ...thinLetter(),
      body_paragraphs: [
        {
          text: 'This rejection cites a fabricated provision. [Source: Ghost, §9]',
          citations: [
            {
              chunk_id: fakeUuid('ghost2'),
              regulation_title: 'Ghost',
              section: '9',
              snippet: 'fabricated provision not present anywhere in retrieval set',
            },
          ],
        },
      ],
    }
    const result = assembleValidatedLetter(caseFacts(), [realChunk], letter, { lowConfidence: true })
    expect(result.paragraphs[0].hasRemovedClaims).toBe(true)
    expect(result.paragraphs[0].validatedText).not.toContain('fabricated provision')
  })

  it('inserts the KB-miss note when lowConfidence is set, and null otherwise', () => {
    const chunk = makeChunk({ content: MASTER_CIRCULAR_TEXT })
    const withMiss = assembleValidatedLetter(caseFacts(), [chunk], thinLetter(), { lowConfidence: true })
    expect(withMiss.kbMissNote).not.toBeNull()
    const noMiss = assembleValidatedLetter(caseFacts(), [chunk], thinLetter(), { lowConfidence: false })
    expect(noMiss.kbMissNote).toBeNull()
  })

  it('always backfills to >= 400 words and >= 3 valid citations even from a thin draft', () => {
    const chunk = makeChunk({ content: MASTER_CIRCULAR_TEXT })
    const result = assembleValidatedLetter(caseFacts(), [chunk], thinLetter(), { lowConfidence: true })

    const wordCount = result.paragraphs.reduce(
      (acc, p) => acc + p.validatedText.split(/\s+/).filter(Boolean).length,
      0
    )
    const validCitations = result.paragraphs.reduce(
      (acc, p) => acc + p.citations.filter((c) => c.status !== 'fail').length,
      0
    )
    expect(wordCount).toBeGreaterThanOrEqual(400)
    expect(validCitations).toBeGreaterThanOrEqual(3)
  })

  it('emits the verbatim §2 scaffold blocks (header / tri-clause / escalation)', () => {
    const chunk = makeChunk({ content: MASTER_CIRCULAR_TEXT })
    const result = assembleValidatedLetter(caseFacts(), [chunk], thinLetter(), {})
    expect(result.headerBlock).toContain('Grievance Redressal Officer')
    expect(result.triClauseBlock).toContain('(iii)')
    expect(result.triClauseBlock).toContain('₹75,000')
    expect(result.escalationBlock).toContain('Bima Bharosa')
  })
})
