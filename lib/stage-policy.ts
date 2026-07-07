// The adapt-vs-rebuild decision (PRD §2.4) — an explicit, logged policy call,
// not a coin flip. Whatever it decides, the stage artifact generation ALWAYS
// re-runs the full REASON→GROUND→VALIDATE pipeline with updated facts; this
// policy only controls whether the prior stage's grounded angles are offered
// to the strategize step as a starting frame ('adapted') or the reasoning
// starts fresh ('rebuilt'). The citation bar never drops either way.

import type { DisputeStage } from '@/lib/deadlines'

export interface GenerationStrategyInput {
  stage: DisputeStage
  /** Docs uploaded after the previous stage's artifact was generated (e.g. the insurer's GRO reply). */
  newDocumentsSinceLastStage: boolean
  /** How many of the previous stage's angles were VERIFIED (grounded ≥ floor). */
  priorVerifiedAngleCount: number
}

export interface GenerationStrategy {
  decision: 'adapted' | 'rebuilt'
  /** Plain-English reason, surfaced to the user in the DecisionCard. */
  reason: string
}

export function decideGenerationStrategy(input: GenerationStrategyInput): GenerationStrategy {
  if (input.stage === 'ombudsman') {
    return {
      decision: 'rebuilt',
      reason:
        'The ombudsman requires a statement-of-case format, which changes what a winning argument looks like — so we built your complaint fresh rather than re-aiming the earlier letter.',
    }
  }

  if (input.newDocumentsSinceLastStage) {
    return {
      decision: 'rebuilt',
      reason:
        "New documents were added since the last stage (such as your insurer's reply), so we rebuilt the arguments from scratch to address every new point they raised.",
    }
  }

  if (input.priorVerifiedAngleCount === 0) {
    return {
      decision: 'rebuilt',
      reason:
        "The earlier letter's arguments had limited regulatory grounding, so we rebuilt the case from scratch for this stage instead of carrying them forward.",
    }
  }

  return {
    decision: 'adapted',
    reason:
      'Your earlier arguments still hold and nothing new has come from the insurer — we re-aimed the same verified arguments at the new authority with the tone and format it expects.',
  }
}
