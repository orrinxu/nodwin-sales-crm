/** Calendar-quarter helpers for sales targets (ORR-726). Pure. */

// UTC components (ORR-814c): quarterBounds/quarterBoundaries resolve quarter
// calendar boundaries in UTC, so "which quarter is now" must be read in UTC too.
// Using local getFullYear/getMonth on a non-UTC server let the target card label a
// quarter (from quarterOf) that disagreed with the quarter it queried (quarterBounds).
export function quarterOf(d: Date): { year: number; quarter: number } {
  return { year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 }
}

/** Inclusive [start, end] of a calendar quarter as YYYY-MM-DD (UTC). */
export function quarterBounds(year: number, quarter: number): { startIso: string; endIso: string } {
  const startMonth = (quarter - 1) * 3
  const start = new Date(Date.UTC(year, startMonth, 1))
  const end = new Date(Date.UTC(year, startMonth + 3, 0)) // day 0 of next month = last day
  const iso = (dt: Date) => dt.toISOString().slice(0, 10)
  return { startIso: iso(start), endIso: iso(end) }
}

export function quarterLabel(year: number, quarter: number): string {
  return `Q${quarter} ${year}`
}
