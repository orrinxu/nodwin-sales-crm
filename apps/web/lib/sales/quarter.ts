/** Calendar-quarter helpers for sales targets (ORR-726). Pure. */

export function quarterOf(d: Date): { year: number; quarter: number } {
  return { year: d.getFullYear(), quarter: Math.floor(d.getMonth() / 3) + 1 }
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
