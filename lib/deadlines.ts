// Deadline computation for the Dispute Engine (pure functions — no I/O).
//
// Escalation ladder facts (CLAUDE.md §5, verified):
//  - GRO: file within 15 days of rejection; insurer must respond within 15 days.
//  - Bima Bharosa / IGMS: file after the GRO window fails; insurer response
//    window 15 days. No hard statutory filing limit — we recommend 30 days
//    after the GRO response fell due.
//  - Insurance Ombudsman: file within 1 YEAR of the insurer's final rejection
//    (hard statutory limit, Ombudsman Rules 2017).
//  - Consumer Court: 2-year limitation period (guidance only).

export type DisputeStage = 'gro' | 'bima_bharosa' | 'ombudsman' | 'consumer_court'
export type StageStatus =
  | 'not_started'
  | 'drafted'
  | 'filed'
  | 'awaiting_response'
  | 'resolved'
  | 'escalated'

export const STAGE_ORDER: DisputeStage[] = ['gro', 'bima_bharosa', 'ombudsman', 'consumer_court']

export const STAGE_LABELS: Record<DisputeStage, string> = {
  gro: 'Grievance Officer (GRO)',
  bima_bharosa: 'Bima Bharosa (IRDAI portal)',
  ombudsman: 'Insurance Ombudsman',
  consumer_court: 'Consumer Court',
}

export function nextStage(stage: DisputeStage): DisputeStage | null {
  const idx = STAGE_ORDER.indexOf(stage)
  return idx >= 0 && idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface DeadlineContext {
  /** Insurer's rejection date (ISO date) — anchors filing windows. */
  rejectionDate: string | null
  /** When the user filed THIS stage (ISO timestamp), if they have. */
  filedAt: string | null
  /** When the PREVIOUS stage was filed (ISO timestamp), for chained windows. */
  priorStageFiledAt?: string | null
}

export interface StageDeadline {
  /** ISO date the chip counts down to, or null when no meaningful deadline. */
  date: string | null
  /** Plain-English label, e.g. "Insurer's response due". */
  label: string
  /** True when missing the date forfeits a right (statutory limits). */
  hard: boolean
}

/**
 * The single deadline that matters for a stage in its current status.
 * Pre-filing → the file-by date; post-filing → the response-due date.
 */
export function computeDeadline(
  stage: DisputeStage,
  status: StageStatus,
  ctx: DeadlineContext
): StageDeadline {
  const preFiling = status === 'not_started' || status === 'drafted'

  switch (stage) {
    case 'gro': {
      if (preFiling) {
        return {
          date: ctx.rejectionDate ? addDays(ctx.rejectionDate, 15) : null,
          label: 'Recommended date to file with the GRO',
          hard: false,
        }
      }
      return {
        date: ctx.filedAt ? addDays(ctx.filedAt, 15) : null,
        label: "Insurer's GRO response due (15 days)",
        hard: false,
      }
    }
    case 'bima_bharosa': {
      if (preFiling) {
        // GRO response fell due 15 days after GRO filing; recommend filing
        // on Bima Bharosa within 30 days after that.
        const anchor = ctx.priorStageFiledAt
          ? addDays(ctx.priorStageFiledAt, 15)
          : ctx.rejectionDate
        return {
          date: anchor ? addDays(anchor, 30) : null,
          label: 'Recommended date to file on Bima Bharosa',
          hard: false,
        }
      }
      return {
        date: ctx.filedAt ? addDays(ctx.filedAt, 15) : null,
        label: "Insurer's response due on Bima Bharosa (15 days)",
        hard: false,
      }
    }
    case 'ombudsman': {
      if (preFiling) {
        return {
          date: ctx.rejectionDate ? addDays(ctx.rejectionDate, 365) : null,
          label: 'Statutory limit: file within 1 year of final rejection',
          hard: true,
        }
      }
      return {
        date: null,
        label: 'Awaiting ombudsman proceedings (no fixed response date)',
        hard: false,
      }
    }
    case 'consumer_court': {
      return {
        date: ctx.rejectionDate ? addDays(ctx.rejectionDate, 730) : null,
        label: 'Limitation period: 2 years from rejection',
        hard: true,
      }
    }
  }
}

/** Days from today (UTC) to an ISO date; negative = overdue. */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const target = new Date(`${isoDate}T00:00:00Z`).getTime()
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).getTime()
  return Math.round((target - today) / 86_400_000)
}
