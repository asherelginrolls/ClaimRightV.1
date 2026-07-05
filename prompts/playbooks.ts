// Per-category legal-angle playbooks for the STRATEGIZE step (CLAUDE.md §7).
// These are hints and traps for the reasoning model — first-principles guidance,
// NOT citations. Grounding against the KB happens after strategizing; nothing
// here may be quoted as a source in a letter.

import type { CanonicalCategory } from '@/prompts/category-baselines'

export interface CategoryPlaybook {
  category: CanonicalCategory
  candidateAngles: string[]
  traps: string[]
}

export const CATEGORY_PLAYBOOKS: Record<CanonicalCategory, CategoryPlaybook> = {
  pre_existing_condition: {
    category: 'pre_existing_condition',
    candidateAngles: [
      'If continuous coverage ≥ 60 months (counting ported/migrated credit): the moratorium bars PED/non-disclosure repudiation absent established fraud.',
      'Insurer must prove the condition actually pre-existed policy inception with contemporaneous medical evidence — not inference from the current diagnosis.',
      'PED waiting period cannot exceed 48 months (standardized Excl01); check whether the policy-stated PED period was already served.',
      'Repudiation requires PMC/CRC approval; demand proof of committee review.',
    ],
    traps: [
      'NEVER invoke the 60-month moratorium when continuous coverage is under 60 months — it does not apply and citing it concedes sloppiness.',
      'Do not argue the condition was disclosed unless the facts actually say so.',
    ],
  },
  policy_exclusion: {
    category: 'policy_exclusion',
    candidateAngles: [
      'Exclusion wording must be specific and unambiguous (no open-ended exclusions); ambiguity is construed against the insurer (contra proferentem).',
      'Certain exclusions are outright prohibited (mental illness, genetic/internal congenital disease, unknown aetiology, ARMD, puberty/menopause disorders); check whether the invoked exclusion is even lawful.',
      'The insurer must map the treated condition to the exact exclusion clause text; demand a clause-by-clause explanation.',
      'Standardized exclusions Excl01–Excl18 have fixed verbatim wording; a repudiation stretching the standard wording misapplies it.',
    ],
    traps: [
      'Do not concede the exclusion applies while arguing procedure — argue misapplication first if the facts support it.',
    ],
  },
  documentation_incomplete: {
    category: 'documentation_incomplete',
    candidateAngles: [
      '"No claim shall be rejected or closed for want of documents or for delayed intimation" — rejection for incomplete documentation is facially invalid.',
      'Insurer/TPA must collect hospital documents from the hospital directly; the policyholder is not required to submit them.',
      'Repeated/successive document demands are a dilatory tactic contrary to the one-go principle; note each demand with its date.',
      'Delay beyond mandated settlement timelines attracts penal interest at bank rate plus 2%, payable suo-moto.',
    ],
    traps: [
      'Do not claim "2% per month" interest — the correct rate is bank rate plus 2 percent.',
      'Do not concede any document was genuinely indispensable and unsubmitted.',
    ],
  },
  non_disclosure: {
    category: 'non_disclosure',
    candidateAngles: [
      'If continuous coverage ≥ 60 months: the moratorium bars non-disclosure repudiation absent established fraud.',
      'Insurer bears the burden of proving materiality: the specific question asked at proposal, the false answer, and contemporaneous evidence of the policyholder\'s knowledge.',
      'A nexus is required between the allegedly undisclosed condition and the claimed illness; unrelated non-disclosure cannot defeat the claim.',
      'Repudiation requires PMC/CRC review; a bare allegation without the underwriting record is procedurally invalid.',
    ],
    traps: [
      'NEVER invoke the 60-month moratorium when coverage is under 60 months — this is the classic inversion error; it does not protect the claimant and citing it hands the insurer an easy rebuttal.',
    ],
  },
  waiting_period: {
    category: 'waiting_period',
    candidateAngles: [
      'Excl02 is LIST-based: the insurer must show the treated condition is actually enumerated on the policy\'s own specified-disease list. An acute or unlisted condition cannot be repudiated under Excl02.',
      'Accident-related claims are exempt from Excl02 and the 30-day initial waiting period by the standard wording itself.',
      'Waiting period must be computed from first policy inception with full portability credit for prior continuous coverage.',
      'Procedural violations stand independently: decision delays, repeated document demands, missing PMC/CRC approval.',
    ],
    traps: [
      'NEVER argue that the policy age being SHORTER than the waiting period helps the claimant (e.g. "only 9 months into a 24-month period") — that concedes the treatment falls inside the waiting period and destroys the letter. If the condition is inside a validly-applied waiting period, attack the exclusion\'s applicability (is the condition on the list?) and the procedure, never the arithmetic.',
    ],
  },
  cashless_denial: {
    category: 'cashless_denial',
    candidateAngles: [
      'Cashless authorization must be decided within ONE hour of the request; silence or delay beyond that is a breach.',
      'Discharge authorization must be granted within THREE hours; charges accruing from insurer delay are borne by the insurer from shareholders\' funds.',
      'An insurer whose own delay forced private payment cannot then reduce reimbursement (e.g. network rate caps) — it cannot profit from its own breach.',
      'Delayed settlement attracts penal interest at bank rate plus 2%, suo-moto.',
    ],
    traps: [
      'Do not frame the cashless denial as a final claim decision if it was a pre-auth lapse — the reimbursement claim stands separately.',
    ],
  },
  experimental_treatment: {
    category: 'experimental_treatment',
    candidateAngles: [
      'IRDAI mandates coverage of enumerated advanced/technological treatments (robotic surgery, immunotherapy, oral chemotherapy, etc.) — check whether the treatment is on the mandated list.',
      'Excl16 defines "unproven" strictly as lacking significant medical documentation of effectiveness; a treating-doctor certificate of standard practice defeats the label.',
      'The burden is on the insurer to show the treatment is genuinely outside coverage — not on the policyholder to prove it is established.',
    ],
    traps: [
      'Do not concede the treatment is novel/experimental; the argument is that it fails the Excl16 definition of unproven.',
    ],
  },
  fraud_suspected: {
    category: 'fraud_suspected',
    candidateAngles: [
      'Fraud must be established with documented evidence, not suspected — demand the investigation report and specific findings.',
      'Procedural rights survive a fraud allegation: reasoned written rejection, PMC/CRC review, GRO response within 15 days, escalation rights.',
    ],
    traps: [
      'Keep the tone strictly procedural; never argue facts of the alleged fraud without evidence in hand.',
    ],
  },
  other: {
    category: 'other',
    candidateAngles: [
      'Right to a reasoned written rejection citing the specific policy clause relied upon.',
      'GRO must respond within 15 days; escalation to Bima Bharosa and the Insurance Ombudsman is available thereafter.',
      'Settlement delay attracts penal interest at bank rate plus 2%, suo-moto.',
    ],
    traps: [
      'Do not invent a category-specific regulation when the rejection ground is unclear — argue procedure.',
    ],
  },
}

export function getPlaybook(category: string): CategoryPlaybook {
  return (
    CATEGORY_PLAYBOOKS[category as CanonicalCategory] ?? CATEGORY_PLAYBOOKS.other
  )
}
