import { isTerminalStage } from "@/lib/opportunity/stage"
import type { DealStage } from "@/lib/opportunity/stage"

/**
 * Deal-card health signals for the pipeline board / table.
 *
 * All helpers here are PURE (they take `nowMs` and the raw inputs, never read the
 * clock or the DB themselves) so they unit-test cleanly and can run on the server
 * over a whole batch. The batched data fetch lives in `lib/data/deal-health.ts`.
 *
 * Signals are advisory only — they never gate an action. Each is `null` when its
 * condition does not hold, so a healthy open deal has all-null health.
 */

const DAY_MS = 86_400_000

export interface DealHealth {
  /** Open deal past its `close_date`. `days` ≥ 1. */
  overdue: { days: number } | null
  /**
   * Open deal gone quiet past its per-stage staleness threshold. `days` is the
   * age of the staleness baseline (MAX(activities.created_at), or the deal's own
   * `created_at` when it has no activity at all — never `updated_at`).
   */
  stale: { days: number; thresholdDays: number } | null
}

export interface DealHealthInput {
  stage: DealStage
  /** `close_date` — a bare `YYYY-MM-DD` or a full ISO timestamp. */
  closeDate: string | null
  /** Opportunity `created_at` ISO — the staleness baseline when there is no activity. */
  createdAt: string
  /** MAX(activities.created_at) in ms for this deal, or `null` when it has none. */
  lastActivityMs: number | null
  /** Per-stage staleness threshold (days). `undefined` disables the stale signal. */
  thresholdDays: number | undefined
  /** "Now" in ms — supplied by the caller so this stays pure/testable. */
  nowMs: number
}

/**
 * Days since the staleness baseline: MAX(activity) if any, else the deal's own
 * `created_at` (a zero-activity deal is aged from creation, never treated as
 * fresh and never aged from `updated_at`).
 */
export function daysSinceActivity(input: {
  lastActivityMs: number | null
  createdAt: string
  nowMs: number
}): number {
  const baseline = input.lastActivityMs ?? new Date(input.createdAt).getTime()
  return Math.max(0, Math.floor((input.nowMs - baseline) / DAY_MS))
}

export function computeDealHealth(input: DealHealthInput): DealHealth {
  // Terminal deals (won / lost) are out of play — no advisory signals.
  if (isTerminalStage(input.stage)) return { overdue: null, stale: null }

  const todayIso = new Date(input.nowMs).toISOString().slice(0, 10)

  // Overdue: past close_date while still open. close_date may be a bare date or a
  // full ISO timestamp — compare (and age) on the date part.
  let overdue: DealHealth["overdue"] = null
  if (input.closeDate) {
    const closeDatePart = input.closeDate.slice(0, 10)
    if (closeDatePart < todayIso) {
      const days = Math.max(
        1,
        Math.floor((input.nowMs - new Date(closeDatePart).getTime()) / DAY_MS),
      )
      overdue = { days }
    }
  }

  // Stale: quiet past the per-stage threshold.
  let stale: DealHealth["stale"] = null
  if (input.thresholdDays !== undefined) {
    const days = daysSinceActivity(input)
    if (days >= input.thresholdDays) {
      stale = { days, thresholdDays: input.thresholdDays }
    }
  }

  return { overdue, stale }
}

/** True when a deal has at least one active health signal worth badging. */
export function hasHealthSignal(health: DealHealth | null | undefined): boolean {
  return !!health && (health.overdue !== null || health.stale !== null)
}

export function overdueLabel(days: number): string {
  return `${days}d overdue`
}

export function staleLabel(days: number): string {
  return `${days}d no activity`
}
