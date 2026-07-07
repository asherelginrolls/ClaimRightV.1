// Stage framings (PRD §2.4 / Phase 5). Each escalation stage re-aims the SAME
// citation-gated letter pipeline at a different authority: the header block,
// relief clause, escalation sentence, and tone shift — the grounding rules,
// span validation, and post-payment guarantees do not.

import type { DisputeStage } from '@/lib/deadlines'
import {
  LETTER_HEADER_TEMPLATE,
  LETTER_TRI_CLAUSE,
  LETTER_ESCALATION_SENTENCE,
} from '@/prompts/generation'

export interface StageFraming {
  /** Verbatim "To, ..." block prepended to the letter. */
  headerBlock: (dateStr: string, insurer: string) => string
  /** Verbatim relief clause appended after the numbered paragraphs. */
  reliefBlock: (amountRupees: number) => string
  /** Verbatim escalation/reservation sentence appended near the end. */
  escalationBlock: string
  /** Appended to the generation system prompt: addressee, format, tone. */
  systemSuffix: string
}

const GRO_FRAMING: StageFraming = {
  headerBlock: LETTER_HEADER_TEMPLATE,
  reliefBlock: LETTER_TRI_CLAUSE,
  escalationBlock: LETTER_ESCALATION_SENTENCE,
  systemSuffix: '',
}

const BB_FRAMING: StageFraming = {
  headerBlock: (dateStr, insurer) =>
    `${dateStr}\n\nComplaint against: ${insurer}\nFiled through: Bima Bharosa (IGMS), the grievance portal of the Insurance Regulatory and Development Authority of India (IRDAI)`,
  reliefBlock: (amountRupees) => {
    const formattedAmount = `₹${amountRupees.toLocaleString('en-IN')}`
    return [
      'Through this complaint, I request that the Authority direct the insurer to:',
      `(i)   Reconsider and settle the claim of ${formattedAmount} in full;`,
      '(ii)  Pay penal interest at the bank rate plus 2% on the delayed amount, suo-moto, as mandated by the IRDAI Master Circular on Protection of Policyholders’ Interests dated 05.09.2024, if applicable;',
      '(iii) Provide a written reasoned response within the timelines prescribed under IRDAI grievance redressal norms.',
    ].join('\n')
  },
  escalationBlock:
    'The insurer’s Grievance Redressal Officer has already been approached and has failed to resolve this grievance satisfactorily. Should this complaint not be resolved, I reserve the right to approach the Insurance Ombudsman under the Insurance Ombudsman Rules 2017.',
  systemSuffix: `

STAGE OVERRIDE — BIMA BHAROSA (IGMS) COMPLAINT:
This letter is NOT addressed to the insurer's GRO. It is the complaint text the policyholder will file against the insurer on IRDAI's Bima Bharosa portal. Address the Authority (IRDAI), refer to the insurer in the third person ("the insurer", "the respondent insurer"), and state that the GRO stage was already exhausted (mention the GRO grievance and its outcome from the case facts if provided). The subject line should read like a complaint title, e.g. "Complaint against [Insurer] — wrongful repudiation of health-insurance claim". Everything else — citation rules, numbered paragraphs, formal register — is unchanged.`,
}

const OMBUDSMAN_FRAMING: StageFraming = {
  headerBlock: (dateStr, insurer) =>
    `${dateStr}\n\nTo,\nThe Office of the Insurance Ombudsman\n(having jurisdiction over the policyholder's place of residence)\n\nComplaint against: ${insurer}\nSTATEMENT OF CASE (in support of the complaint under the Insurance Ombudsman Rules 2017)`,
  reliefBlock: (amountRupees) => {
    const formattedAmount = `₹${amountRupees.toLocaleString('en-IN')}`
    return [
      'RELIEF SOUGHT — The complainant prays that the Hon’ble Ombudsman be pleased to:',
      `(i)   Direct the insurer to settle the claim of ${formattedAmount} in full;`,
      '(ii)  Direct payment of penal interest at the bank rate plus 2% on the delayed amount as mandated by the IRDAI Master Circular on Protection of Policyholders’ Interests dated 05.09.2024, if applicable;',
      '(iii) Award such further relief as the Hon’ble Ombudsman deems fit, noting that awards are binding on the insurer and attract a penalty of ₹5,000 per day for non-compliance beyond 30 days under the Insurance Ombudsman Rules 2017.',
    ].join('\n')
  },
  escalationBlock:
    'The complainant confirms that the subject matter of this complaint is not pending before any court, consumer forum, or arbitrator, and that the complaint is filed within one year of the insurer’s final rejection as required under the Insurance Ombudsman Rules 2017.',
  systemSuffix: `

STAGE OVERRIDE — INSURANCE OMBUDSMAN STATEMENT OF CASE:
This letter is a STATEMENT OF CASE supporting a complaint before the Insurance Ombudsman (Form VI-A style). Write in the third person as "the complainant" (e.g. "The complainant submits that…"). Structure the numbered paragraphs as a chronology-plus-grounds narrative: first the facts (policy, claim, rejection, prior GRO/Bima Bharosa attempts from the case facts), then each legal ground. The subject line should read "Statement of Case — [Complainant] v. [Insurer] — wrongful repudiation of health-insurance claim". Remember: no legal representative may appear before the ombudsman, so the text must be complete and self-standing for a lay policyholder to file personally. Everything else — citation rules, formal register, grounding — is unchanged.`,
}

export function getStageFraming(stage: DisputeStage): StageFraming {
  switch (stage) {
    case 'gro':
      return GRO_FRAMING
    case 'bima_bharosa':
      return BB_FRAMING
    case 'ombudsman':
      return OMBUDSMAN_FRAMING
    case 'consumer_court':
      // Consumer court is guidance-only (no generated filing) — callers must
      // not request a letter for it; returning GRO framing keeps types total.
      return GRO_FRAMING
  }
}
