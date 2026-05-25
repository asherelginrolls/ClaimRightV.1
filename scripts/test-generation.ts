// Usage: npx tsx scripts/test-generation.ts
//
// Regression test for the post-payment generation guarantee
// (CLAUDE_PART2.md §1). Exercises lib/generation.ts → assembleValidatedLetter
// with 9 canonical categories × 3 retrieval scenarios = 27 cases.
//
// No network: this script mocks both retrieval (synthetic KbSearchResult
// chunks) and LLM output (hand-built LetterOutput JSON), and feeds them
// through the pure assembler. It does NOT touch Supabase, Voyage, or
// Anthropic.
//
// Assertions per case:
//   - validated word count ≥ 400
//   - valid (non-fail) citations ≥ 3
//   - subject line non-empty
//
// Exit code: 0 if 27/27 pass, 1 otherwise.

import { randomUUID } from 'crypto'
import {
  assembleValidatedLetter,
  type CaseFacts,
  type GenerationResult,
  type LetterOutput,
} from '../lib/generation'
import {
  CATEGORY_BASELINES,
  type CanonicalCategory,
} from '../prompts/category-baselines'
import type { KbSearchResult } from '../types/kb'

// ── Mock fixtures ───────────────────────────────────────────────────────────

const MASTER_CIRCULAR_TEXT =
  'The IRDAI Master Circular on Health Insurance dated 29 May 2024 prohibits insurers from making piecemeal document requests and mandates that any list of required documents be communicated to the insured at the first instance in writing. Reimbursement claims shall be settled within thirty days of receipt of the last necessary document failing which interest at the rate of two per cent per month shall be payable. Cashless pre-authorisation requests shall be decided within one hour and discharge authorisation requests within three hours. Insurers shall provide reasoned written rejections and respond to grievances addressed to the Grievance Redressal Officer within fifteen days. The policyholder retains the right to escalate the matter to the IRDAI Bima Bharosa portal and to the Insurance Ombudsman under the Insurance Ombudsman Rules 2017.'

const PPOI_TEXT =
  'The Protection of Policyholders Interests Master Circular dated 5 September 2024 establishes a sixty month moratorium on pre-existing disease non-disclosure after continuous coverage. Any repudiation on the ground of pre-existing condition after the moratorium period requires established fraud. Claim rejection must be reviewed by the Policy Management Committee or the Claims Review Committee. The policyholder shall be afforded a thirty day free look period for new policies and migration credit for prior continuous coverage shall be carried forward in full.'

const OMBUDSMAN_TEXT =
  'The Insurance Ombudsman Rules 2017 provide a free and time-bound forum for adjudication of grievances against insurers. The ombudsman may award compensation up to fifty lakh rupees. Non-compliance with an ombudsman award within thirty days attracts a penalty of five thousand rupees per day. No legal representative is permitted to appear before the ombudsman.'

function makeChunk(
  id: string,
  source_title: string,
  section_number: string,
  content: string,
  similarity: number,
  tier: 1 | 2 | 3 = 1
): KbSearchResult {
  return {
    id,
    content,
    source_title,
    section_number,
    circular_number: null,
    issuer: tier === 1 ? 'IRDAI' : 'Insurance Ombudsman',
    url: null,
    tier,
    similarity,
  }
}

function makeHighScoreChunks(): KbSearchResult[] {
  return [
    makeChunk(
      randomUUID(),
      'IRDAI Master Circular on Health Insurance',
      '5.7',
      MASTER_CIRCULAR_TEXT,
      0.85,
      1
    ),
    makeChunk(
      randomUUID(),
      'PPOI Master Circular',
      '3.2',
      PPOI_TEXT,
      0.82,
      1
    ),
    makeChunk(
      randomUUID(),
      'Insurance Ombudsman Rules 2017',
      'Rule 17',
      OMBUDSMAN_TEXT,
      0.78,
      1
    ),
  ]
}

// A verbose body paragraph filler — ~115 words. Used to ensure the LLM's
// fake "high quality" draft hits the 400-word minimum without needing the
// baseline backfill.
function richParagraph(citationMarker: string, theme: string): string {
  return (
    `I respectfully submit that the rejection communicated to me does not withstand scrutiny ` +
    `under the prevailing regulatory framework governing ${theme} in Indian health insurance. ` +
    `The Insurance Regulatory and Development Authority of India has, through binding circulars, ` +
    `prescribed clear procedural and substantive safeguards which the insurer is bound to observe ` +
    `before a claim may lawfully be repudiated. The rejection received by me does not, on its face, ` +
    `disclose compliance with these safeguards, nor does it set out the contemporaneous evidence and ` +
    `reasoning relied upon. I therefore submit that the matter requires reconsideration in light of ` +
    `the binding provisions cited herein, and that a reasoned written response be furnished to me ` +
    `within the statutory timeline. ${citationMarker}`
  )
}

function makeHighScoreLetter(chunks: KbSearchResult[]): LetterOutput {
  // 4 paragraphs, each with one citation that overlaps strongly with its
  // corresponding chunk text → all citations PASS, ≥ 400 words, no backfill.
  const themes = [
    'claim repudiations',
    'documentary requirements',
    'settlement timelines',
    'grievance escalation',
  ]
  const snippets = [
    'IRDAI Master Circular on Health Insurance dated 29 May 2024 prohibits insurers from making piecemeal document requests',
    'Reimbursement claims shall be settled within thirty days of receipt of the last necessary document',
    'Cashless pre-authorisation requests shall be decided within one hour and discharge authorisation requests within three hours',
    'Insurers shall provide reasoned written rejections and respond to grievances addressed to the Grievance Redressal Officer within fifteen days',
  ]
  const body_paragraphs = themes.map((theme, i) => {
    const chunk = chunks[i % chunks.length]
    const marker = `[Source: ${chunk.source_title}, §${chunk.section_number}]`
    return {
      text: richParagraph(marker, theme),
      citations: [
        {
          chunk_id: chunk.id,
          regulation_title: chunk.source_title,
          section: chunk.section_number ?? '',
          snippet: snippets[i],
        },
      ],
    }
  })

  return {
    subject_line: 'Formal Grievance — Claim Repudiation Dispute — Policy No. TEST-001, Claim No. CLM-001',
    salutation: 'Dear Sir/Madam,',
    body_paragraphs,
    closing: 'I look forward to your reasoned written response at the earliest.',
    relief_sought:
      'Reconsideration and settlement of the claim in full, payment of interest where applicable, and a written reasoned response within 15 days.',
  }
}

function makeLowScoreLetter(chunks: KbSearchResult[]): LetterOutput {
  // 2 thin paragraphs with weak-overlap snippets → span validation softens
  // some, hard-minimums loop appends category baselines.
  const chunk = chunks[0]
  const marker = `[Source: ${chunk.source_title}, §${chunk.section_number}]`
  return {
    subject_line: 'Formal Grievance — Claim Repudiation Dispute',
    salutation: 'Dear Sir/Madam,',
    body_paragraphs: [
      {
        text: `I respectfully submit that the rejection received by me is contrary to applicable IRDAI norms. ${marker}`,
        citations: [
          {
            chunk_id: chunk.id,
            regulation_title: chunk.source_title,
            section: chunk.section_number ?? '',
            // Snippet that barely overlaps with chunk content → 'flag' or 'fail'
            snippet: 'random unrelated phrasing nowhere matching actual circular contents textual',
          },
        ],
      },
      {
        text: `Furthermore, the procedural conduct of the insurer in this matter requires review. ${marker}`,
        citations: [
          {
            chunk_id: chunk.id,
            regulation_title: chunk.source_title,
            section: chunk.section_number ?? '',
            snippet: 'completely different vocabulary unrelated tangential subject matter wholly distinct',
          },
        ],
      },
    ],
    closing: 'I await your response.',
    relief_sought: 'Reconsideration and full settlement.',
  }
}

function makeEmptyLetter(): LetterOutput {
  // 1 paragraph with a hallucinated chunk_id → sentence is removed; then
  // hard-minimums loop appends category baselines. No retrieved chunks.
  const hallucinatedId = randomUUID()
  return {
    subject_line: 'Formal Grievance — Claim Repudiation Dispute',
    salutation: 'Dear Sir/Madam,',
    body_paragraphs: [
      {
        text:
          'I respectfully submit that this rejection violates applicable IRDAI provisions. ' +
          '[Source: Fabricated Regulation, §99] This is an additional sentence that should survive deletion.',
        citations: [
          {
            chunk_id: hallucinatedId,
            regulation_title: 'Fabricated Regulation',
            section: '99',
            snippet: 'this snippet references a chunk that does not exist in retrieval',
          },
        ],
      },
    ],
    closing: 'I await your response.',
    relief_sought: 'Reconsideration and full settlement.',
  }
}

// ── Case facts builder ──────────────────────────────────────────────────────

function makeCaseFacts(category: CanonicalCategory): CaseFacts {
  return {
    insurer: 'Test Insurance Co. Ltd.',
    claimAmount: 7_500_000, // ₹75,000 in paise
    rejectionReasonRaw: `Test rejection for category ${category}`,
    rejectionReasonCategory: category,
    rejectionDate: '2026-04-01',
  }
}

// ── Assertions ──────────────────────────────────────────────────────────────

const MIN_WORDS = 400
const MIN_CITATIONS = 3

interface CaseReport {
  category: CanonicalCategory
  scenario: 'high-score' | 'low-score' | 'empty'
  wordCount: number
  validCitations: number
  paragraphs: number
  passed: boolean
  failures: string[]
}

function assertCase(
  category: CanonicalCategory,
  scenario: 'high-score' | 'low-score' | 'empty',
  result: GenerationResult
): CaseReport {
  const failures: string[] = []
  const wordCount = result.paragraphs.reduce(
    (acc, p) => acc + p.validatedText.split(/\s+/).filter(Boolean).length,
    0
  )
  const validCitations = result.paragraphs.reduce(
    (acc, p) => acc + p.citations.filter((c) => c.status !== 'fail').length,
    0
  )

  if (wordCount < MIN_WORDS) failures.push(`words ${wordCount} < ${MIN_WORDS}`)
  if (validCitations < MIN_CITATIONS) failures.push(`valid citations ${validCitations} < ${MIN_CITATIONS}`)
  if (!result.subjectLine.trim()) failures.push('empty subject_line')
  if (!result.headerBlock.includes('Grievance Redressal Officer'))
    failures.push('header block missing GRO line')
  if (!result.triClauseBlock.includes('(iii)'))
    failures.push('tri-clause missing (iii)')
  if (!result.escalationBlock.includes('Bima Bharosa'))
    failures.push('escalation block missing Bima Bharosa')

  return {
    category,
    scenario,
    wordCount,
    validCitations,
    paragraphs: result.paragraphs.length,
    passed: failures.length === 0,
    failures,
  }
}

// ── Runner ──────────────────────────────────────────────────────────────────

function runOne(
  category: CanonicalCategory,
  scenario: 'high-score' | 'low-score' | 'empty'
): CaseReport {
  const facts = makeCaseFacts(category)
  let chunks: KbSearchResult[]
  let letter: LetterOutput

  if (scenario === 'high-score') {
    chunks = makeHighScoreChunks()
    letter = makeHighScoreLetter(chunks)
  } else if (scenario === 'low-score') {
    chunks = makeHighScoreChunks()
    letter = makeLowScoreLetter(chunks)
  } else {
    chunks = []
    letter = makeEmptyLetter()
  }

  const result = assembleValidatedLetter(facts, chunks, letter, {
    lowConfidence: scenario !== 'high-score',
  })
  return assertCase(category, scenario, result)
}

function main(): void {
  const categories: CanonicalCategory[] = Object.keys(CATEGORY_BASELINES) as CanonicalCategory[]
  const scenarios: Array<'high-score' | 'low-score' | 'empty'> = [
    'high-score',
    'low-score',
    'empty',
  ]

  const reports: CaseReport[] = []
  for (const cat of categories) {
    for (const sc of scenarios) {
      reports.push(runOne(cat, sc))
    }
  }

  const passed = reports.filter((r) => r.passed).length
  const failed = reports.filter((r) => !r.passed)

  // Print summary table
  console.log('\n┌─────────────────────────────┬─────────────┬───────┬───────────┬───────┬───────┐')
  console.log('│ Category                    │ Scenario    │ Words │ Citations │ Paras │ Pass  │')
  console.log('├─────────────────────────────┼─────────────┼───────┼───────────┼───────┼───────┤')
  for (const r of reports) {
    const cat = r.category.padEnd(27)
    const sc = r.scenario.padEnd(11)
    const w = String(r.wordCount).padStart(5)
    const c = String(r.validCitations).padStart(9)
    const p = String(r.paragraphs).padStart(5)
    const ok = r.passed ? '  ✓  ' : '  ✗  '
    console.log(`│ ${cat} │ ${sc} │ ${w} │ ${c} │ ${p} │ ${ok} │`)
  }
  console.log('└─────────────────────────────┴─────────────┴───────┴───────────┴───────┴───────┘')

  if (failed.length > 0) {
    console.log('\nFailures:')
    for (const r of failed) {
      console.log(`  ${r.category} / ${r.scenario}: ${r.failures.join('; ')}`)
    }
  }

  console.log(`\n${passed}/${reports.length} ${passed === reports.length ? '✓' : '✗'}`)
  process.exit(failed.length > 0 ? 1 : 0)
}

main()
