import { Money } from "@/lib/money"
import { isTerminalStage } from "@/lib/opportunity/stage"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"

/**
 * Presentational intelligence for the kanban board.
 *
 * All helpers are pure so they can be unit-tested without a DOM. Card-level
 * signals (hot / overdue) are advisory badges only — they never change data or
 * gate any action. Thresholds match the ORR-600 Tier-1 #2 defaults.
 */

/** Probability at or above this (on a non-terminal deal) marks a hot lead. */
export const HOT_LEAD_PROBABILITY_PCT = 70

/**
 * A deal is "hot" when it is still in play (non-terminal) and its win
 * probability is at or above the hot-lead threshold.
 */
export function isHotLead(opp: OpportunityRecord): boolean {
  return !isTerminalStage(opp.stage) && opp.probabilityPct >= HOT_LEAD_PROBABILITY_PCT
}

/**
 * A deal is "overdue" when it is still in play (non-terminal) and its expected
 * close date is strictly before today. Terminal deals and deals with no close
 * date are never overdue.
 *
 * @param todayIso today's date as `YYYY-MM-DD` (caller supplies it so this stays pure)
 */
export function isOverdue(opp: OpportunityRecord, todayIso: string): boolean {
  if (isTerminalStage(opp.stage)) return false
  if (!opp.closeDate) return false
  // closeDate may be a bare date or a full ISO timestamp; compare the date part.
  const closeDatePart = opp.closeDate.slice(0, 10)
  return closeDatePart < todayIso
}

/**
 * Sum a set of opportunities into per-currency subtotals. Amounts in different
 * currencies are never combined (Money.add throws on mismatch), so each
 * currency gets its own running total. Insertion order of first appearance is
 * preserved for stable display.
 */
export function sumByCurrency(opportunities: OpportunityRecord[]): Money[] {
  const totals = new Map<string, Money>()
  for (const opp of opportunities) {
    const amount = Money.fromAmount(opp.amount, opp.currency)
    const existing = totals.get(opp.currency)
    totals.set(opp.currency, existing ? existing.add(amount) : amount)
  }
  return [...totals.values()]
}

/**
 * Human-readable per-currency total for a column header, e.g.
 * `"$120,000.00 · €5,000.00"`. Empty string when there is nothing to sum.
 */
export function formatColumnTotal(opportunities: OpportunityRecord[]): string {
  return sumByCurrency(opportunities)
    .map((m) => m.toDisplay())
    .join(" · ")
}
