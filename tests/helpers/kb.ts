// Shared KB fixtures for unit + integration tests. No network, no imports of
// production clients — just plain objects shaped like KbSearchResult.

import type { KbSearchResult } from '@/types/kb'
import type { RetrievalResult } from '@/lib/retrieval'

export const MASTER_CIRCULAR_TEXT =
  'The IRDAI Master Circular on Health Insurance dated 29 May 2024 prohibits insurers from making piecemeal document requests and mandates that any list of required documents be communicated to the insured at the first instance in writing. Reimbursement claims shall be settled within thirty days of receipt of the last necessary document failing which interest at the rate of two per cent per month shall be payable. Cashless pre-authorisation requests shall be decided within one hour and discharge authorisation requests within three hours. Insurers shall provide reasoned written rejections and respond to grievances addressed to the Grievance Redressal Officer within fifteen days. The policyholder retains the right to escalate the matter to the IRDAI Bima Bharosa portal and to the Insurance Ombudsman under the Insurance Ombudsman Rules 2017.'

export const PPOI_TEXT =
  'The Protection of Policyholders Interests Master Circular dated 5 September 2024 establishes a sixty month moratorium on pre-existing disease non-disclosure after continuous coverage. Any repudiation on the ground of pre-existing condition after the moratorium period requires established fraud. Claim rejection must be reviewed by the Policy Management Committee or the Claims Review Committee.'

export const OMBUDSMAN_TEXT =
  'The Insurance Ombudsman Rules 2017 provide a free and time-bound forum for adjudication of grievances against insurers. The ombudsman may award compensation up to fifty lakh rupees. Non-compliance with an ombudsman award within thirty days attracts a penalty of five thousand rupees per day.'

let chunkCounter = 0

/** Deterministic uuid-shaped id so chunkMap lookups are stable across runs. */
export function fakeUuid(seed?: string): string {
  if (seed) {
    const hex = seed.padEnd(12, '0').slice(0, 12)
    return `00000000-0000-4000-8000-${hex}`
  }
  chunkCounter += 1
  const hex = String(chunkCounter).padStart(12, '0')
  return `00000000-0000-4000-8000-${hex}`
}

export function makeChunk(overrides: Partial<KbSearchResult> = {}): KbSearchResult {
  return {
    id: overrides.id ?? fakeUuid(),
    content: overrides.content ?? MASTER_CIRCULAR_TEXT,
    source_title: overrides.source_title ?? 'IRDAI Master Circular on Health Insurance',
    // honor an explicit `null` (don't let ?? coerce it back to the default)
    section_number: overrides.section_number === undefined ? '5.7' : overrides.section_number,
    circular_number: overrides.circular_number ?? null,
    issuer: overrides.issuer ?? 'IRDAI',
    url: overrides.url ?? null,
    tier: overrides.tier ?? 1,
    similarity: overrides.similarity ?? 0.82,
  }
}

export function makeRetrieval(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  const chunks = overrides.chunks ?? []
  return {
    chunks,
    queryEmbedding: overrides.queryEmbedding ?? [],
    topScore: overrides.topScore ?? (chunks[0]?.similarity ?? 0),
  }
}
