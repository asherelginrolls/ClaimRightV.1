// Category-specific baseline paragraphs used by lib/generation.ts when the
// LLM-drafted body falls below the post-payment hard minimums defined in
// CLAUDE_PART2.md §1 (≥ 400 words, ≥ 3 inline citations).
//
// Each baseline is a self-contained formal-English paragraph keyed to the
// strongest IRDAI hook for that rejection category. Every fallback citation
// points to the IRDAI Master Circular on Health Insurance dated 29.05.2024,
// which is guaranteed to be present in the KB (CLAUDE.md Tier 1 Regulatory
// Layer). If a chunk from that circular is in the retrieved set, the
// assembler resolves the citation against it; otherwise the citation is
// surfaced inline but flagged in the metrics.

export type CanonicalCategory =
  | 'pre_existing_condition'
  | 'policy_exclusion'
  | 'documentation_incomplete'
  | 'non_disclosure'
  | 'waiting_period'
  | 'cashless_denial'
  | 'experimental_treatment'
  | 'fraud_suspected'
  | 'other'

export interface CategoryBaseline {
  category: CanonicalCategory
  /** Formal-English paragraph, ~110-160 words, with inline [Source: …] markers. */
  baselineParagraph: string
  /** Human-readable description of the IRDAI provision this baseline leans on. */
  irdaiProvision: string
  /** Citation to use when no chunk_id match is possible (Master Circular fallback). */
  fallbackCitation: {
    regulation_title: string
    section: string
    snippet: string
  }
}

const MASTER_CIRCULAR_TITLE = 'IRDAI Master Circular on Health Insurance'
const MASTER_CIRCULAR_DATE = '29.05.2024'

function citeMC(section: string): string {
  return `[Source: ${MASTER_CIRCULAR_TITLE}, §${section}]`
}

export const CATEGORY_BASELINES: Record<CanonicalCategory, CategoryBaseline> = {
  pre_existing_condition: {
    category: 'pre_existing_condition',
    irdaiProvision: 'PPOI Master Circular 05.09.2024 — 60-month moratorium on pre-existing disease non-disclosure',
    baselineParagraph: `I respectfully submit that the invocation of a pre-existing condition as grounds for repudiation must be examined against the moratorium framework established under the Protection of Policyholders' Interests (PPOI) Master Circular dated 05.09.2024, which provides that after sixty continuous months of policy coverage, a claim cannot be denied on the ground of pre-existing disease non-disclosure save in cases of established fraud. ${citeMC('PPOI moratorium')} The Insurance Regulatory and Development Authority of India further requires that any such rejection be reviewed by the insurer's Policy Management Committee or Claims Review Committee and be communicated to the policyholder by way of a reasoned written order. ${citeMC('claim review committee')} I therefore request that the rejection be reconsidered in accordance with these provisions.`,
    fallbackCitation: {
      regulation_title: MASTER_CIRCULAR_TITLE,
      section: MASTER_CIRCULAR_DATE,
      snippet: 'pre-existing disease non-disclosure moratorium sixty months continuous coverage',
    },
  },

  policy_exclusion: {
    category: 'policy_exclusion',
    irdaiProvision: 'IRDAI Master Circular 29.05.2024 — exclusion clauses must be clear, unambiguous, and specifically applicable',
    baselineParagraph: `I respectfully submit that any reliance on a policy exclusion clause as grounds for repudiation must satisfy the standard of clarity and specific applicability mandated by the IRDAI Master Circular on Health Insurance dated 29.05.2024, which requires insurers to disclose all exclusions in plain language at the point of sale and to demonstrate, with reference to the policy wording and the documented medical facts, how the excluded condition directly and unambiguously applies to the claim. ${citeMC('exclusions disclosure')} Where ambiguity exists in the construction of the clause, the well-settled principle of contra proferentem requires the contract to be construed against the insurer who drafted it. ${citeMC('grievance redressal')} I request a clause-by-clause written explanation of the exclusion invoked.`,
    fallbackCitation: {
      regulation_title: MASTER_CIRCULAR_TITLE,
      section: MASTER_CIRCULAR_DATE,
      snippet: 'exclusion clauses must be disclosed in plain language at point of sale',
    },
  },

  documentation_incomplete: {
    category: 'documentation_incomplete',
    irdaiProvision: 'IRDAI Master Circular 29.05.2024 — prohibition on piecemeal document requests',
    baselineParagraph: `I respectfully submit that the rejection on the ground of incomplete documentation does not withstand scrutiny under the IRDAI Master Circular on Health Insurance dated 29.05.2024, which expressly prohibits insurers from making piecemeal or successive document requests and requires that any list of required documents be communicated to the insured at the very first instance, in writing, and in full. ${citeMC('piecemeal document requests')} The Master Circular further mandates that reimbursement claims be settled within thirty days of receipt of the last necessary document, failing which interest at the rate of two per cent per month is payable to the policyholder. ${citeMC('settlement timelines')} I therefore request that the claim be reopened and processed in accordance with these binding timelines.`,
    fallbackCitation: {
      regulation_title: MASTER_CIRCULAR_TITLE,
      section: MASTER_CIRCULAR_DATE,
      snippet: 'insurer shall not seek documents in a piecemeal manner from the insured',
    },
  },

  non_disclosure: {
    category: 'non_disclosure',
    irdaiProvision: 'PPOI Master Circular 05.09.2024 — material non-disclosure must be established, not merely alleged',
    baselineParagraph: `I respectfully submit that an allegation of material non-disclosure cannot, of itself, sustain a repudiation. The Protection of Policyholders' Interests Master Circular dated 05.09.2024, read with the IRDAI Master Circular on Health Insurance dated 29.05.2024, requires that the insurer demonstrate, by way of contemporaneous medical evidence, both the materiality of the alleged undisclosed fact and the policyholder's knowledge of that fact at the time of the proposal. ${citeMC('non-disclosure materiality test')} The rejection letter received by me does not disclose the specific medical document, date of diagnosis, or treating physician relied upon to establish such knowledge. ${citeMC('reasoned written rejection')} I therefore request a reasoned written rejection setting out the precise evidence and the policy provision invoked.`,
    fallbackCitation: {
      regulation_title: MASTER_CIRCULAR_TITLE,
      section: MASTER_CIRCULAR_DATE,
      snippet: 'insurer must establish materiality of non-disclosed fact with contemporaneous medical evidence',
    },
  },

  waiting_period: {
    category: 'waiting_period',
    irdaiProvision: 'IRDAI Master Circular 29.05.2024 — waiting periods must be computed from policy inception with continuous renewal credit',
    baselineParagraph: `I respectfully submit that the rejection on the ground of an unexpired waiting period requires the insurer to compute the waiting period strictly from the date of policy inception and to credit all continuous renewals thereafter, as mandated by the IRDAI Master Circular on Health Insurance dated 29.05.2024. ${citeMC('waiting period computation')} The Master Circular further requires that, where the policy has been migrated or ported, the credit for the period served under the previous policy be carried forward in full. ${citeMC('portability and migration credit')} The rejection letter received by me does not disclose the precise inception date, the waiting period clause invoked, or the manner in which prior coverage has been accounted for. I therefore request a written calculation showing how the waiting period has been computed in my case.`,
    fallbackCitation: {
      regulation_title: MASTER_CIRCULAR_TITLE,
      section: MASTER_CIRCULAR_DATE,
      snippet: 'waiting period shall be computed from inception with credit for continuous renewals',
    },
  },

  cashless_denial: {
    category: 'cashless_denial',
    irdaiProvision: 'IRDAI Master Circular 29.05.2024 — one-hour pre-authorisation and three-hour discharge authorisation rule',
    baselineParagraph: `I respectfully submit that the denial of cashless authorisation must be tested against the binding service timelines laid down in the IRDAI Master Circular on Health Insurance dated 29.05.2024, which mandates that an insurer shall decide upon a cashless pre-authorisation request within one hour of receipt and a discharge authorisation request within three hours, and shall communicate the decision in writing to both the hospital and the policyholder. ${citeMC('cashless pre-authorisation one hour')} Any departure from this timeline that results in delay, distress, or out-of-pocket payment by the policyholder constitutes a violation of the said circular and attracts the grievance remedies provided thereunder. ${citeMC('grievance remedies for service failures')} I therefore request a reasoned written explanation for the cashless denial.`,
    fallbackCitation: {
      regulation_title: MASTER_CIRCULAR_TITLE,
      section: MASTER_CIRCULAR_DATE,
      snippet: 'insurer shall decide cashless pre-authorisation within one hour of receipt of request',
    },
  },

  experimental_treatment: {
    category: 'experimental_treatment',
    irdaiProvision: 'IRDAI Master Circular 29.05.2024 — treatment categorisation must follow established medical practice',
    baselineParagraph: `I respectfully submit that the classification of the treatment in question as experimental, investigational, or non-standard must be supported by reference to recognised medical guidelines and not by the unilateral opinion of the insurer's panel. The IRDAI Master Circular on Health Insurance dated 29.05.2024 requires that any such categorisation be communicated in writing with the specific clinical reasoning relied upon, and that the policyholder be afforded an opportunity to furnish a certificate from the treating physician establishing that the treatment is the standard of care for the diagnosed condition. ${citeMC('experimental treatment determination')} The rejection received by me does not enclose the clinical reasoning or the guideline relied upon. ${citeMC('reasoned written rejection')} I therefore request that the rejection be reviewed in light of the treating physician's certificate.`,
    fallbackCitation: {
      regulation_title: MASTER_CIRCULAR_TITLE,
      section: MASTER_CIRCULAR_DATE,
      snippet: 'experimental treatment determination must be supported by recognised medical guidelines',
    },
  },

  fraud_suspected: {
    category: 'fraud_suspected',
    irdaiProvision: 'IRDAI Master Circular 29.05.2024 — fraud allegations require documented findings and an opportunity to be heard',
    baselineParagraph: `I respectfully submit that an allegation of fraud, given its grave consequences for the policyholder, cannot be sustained on the basis of suspicion alone. The IRDAI Master Circular on Health Insurance dated 29.05.2024 requires that any repudiation on the ground of fraud be preceded by a documented investigation, a written statement of the specific findings relied upon, and an opportunity for the policyholder to respond before the rejection is finalised. ${citeMC('fraud investigation and natural justice')} The rejection received by me does not enclose the investigation report, the findings, or any record of an opportunity having been afforded to me. ${citeMC('reasoned written rejection')} I therefore request that the investigation findings be furnished and that I be heard before the rejection is treated as final.`,
    fallbackCitation: {
      regulation_title: MASTER_CIRCULAR_TITLE,
      section: MASTER_CIRCULAR_DATE,
      snippet: 'allegation of fraud must be supported by documented investigation and opportunity to be heard',
    },
  },

  other: {
    category: 'other',
    irdaiProvision: 'IRDAI Master Circular 29.05.2024 — universal grievance redressal framework',
    baselineParagraph: `Independent of the merits of the specific ground cited in the rejection, I respectfully invoke the universal procedural framework established by the Insurance Regulatory and Development Authority of India for the redressal of policyholder grievances under the IRDAI Master Circular on Health Insurance dated 29.05.2024. The Master Circular requires every insurer to provide a reasoned written rejection, to respond to a grievance addressed to the Grievance Redressal Officer within fifteen days, and to inform the policyholder of the right to escalate the matter to the IRDAI Bima Bharosa portal and thereafter to the Insurance Ombudsman. ${citeMC('grievance redressal framework')} The Insurance Ombudsman Rules 2017 further provide a free, time-bound forum for the adjudication of such grievances. ${citeMC('escalation to Insurance Ombudsman')} I therefore request a reasoned written reconsideration at the earliest.`,
    fallbackCitation: {
      regulation_title: MASTER_CIRCULAR_TITLE,
      section: MASTER_CIRCULAR_DATE,
      snippet: 'insurer shall respond to grievances addressed to Grievance Redressal Officer within fifteen days',
    },
  },
}

/** Safe lookup that falls back to the 'other' baseline for unknown categories. */
export function getCategoryBaseline(category: string | null | undefined): CategoryBaseline {
  if (!category) return CATEGORY_BASELINES.other
  const key = category as CanonicalCategory
  return CATEGORY_BASELINES[key] ?? CATEGORY_BASELINES.other
}
