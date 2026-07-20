/**
 * Shared server-driven list pagination helpers (ORR-755).
 *
 * The opportunity / account / contact lists moved their search, filter, sort
 * and paging from client-side `useMemo` over a fully-fetched array to
 * server-side `.range()` queries driven by URL params. Past PostgREST's
 * `max_rows` (1000) the old "fetch everything" path silently truncated while the
 * UI still showed the true `count:'exact'` total — the same class of bug the
 * dashboard-metrics RPC fixed in #341.
 *
 * These pure helpers centralise the param clamping / range math / search
 * sanitisation so every list applies them identically and they stay
 * unit-testable in isolation.
 */

/** Default rows per page for the server-driven tables. */
export const DEFAULT_PAGE_SIZE = 25

/** Hard ceiling on `pageSize` — an over-large `?pageSize=` can't re-introduce the
 *  unbounded fetch this ticket removed. */
export const MAX_PAGE_SIZE = 100

/**
 * Bounded number of cards the kanban board fetches. The board can't paginate
 * (it shows every deal grouped by stage), so instead of an unbounded fetch it
 * pulls the most-recently-updated N and shows accurate per-stage totals from
 * `pipeline_metrics_agg_scoped`. Kept well under `max_rows` so the card fetch
 * itself never truncates.
 */
export const BOARD_FETCH_CAP = 500

/** Clamp an incoming page (1-based) to a sane positive integer. */
export function clampPage(page: number | undefined | null): number {
  if (page == null || !Number.isFinite(page)) return 1
  const n = Math.floor(page)
  return n < 1 ? 1 : n
}

/**
 * Clamp an incoming page size into `[1, max]`, defaulting when absent.
 *
 * `max` defaults to `MAX_PAGE_SIZE` (100) so every normal list caller keeps the
 * hard ceiling that removed the unbounded fetch. The kanban board opts into a
 * larger bounded fetch by passing `BOARD_FETCH_CAP` explicitly (ORR-805) — the
 * default clamp is never weakened for anyone who doesn't ask.
 */
export function clampPageSize(
  pageSize: number | undefined | null,
  max: number = MAX_PAGE_SIZE,
): number {
  if (pageSize == null || !Number.isFinite(pageSize)) return DEFAULT_PAGE_SIZE
  const n = Math.floor(pageSize)
  if (n < 1) return 1
  if (n > max) return max
  return n
}

/**
 * Inclusive `[from, to]` row indices for a 1-based page — feeds `.range()`.
 *
 * `max` is forwarded to `clampPageSize`; without it this belt-and-suspenders
 * re-clamp would silently drop the board's `BOARD_FETCH_CAP` back to 100
 * (ORR-805), so the board path must pass the same ceiling it clamped with.
 */
export function rangeFor(
  page: number,
  pageSize: number,
  max: number = MAX_PAGE_SIZE,
): [from: number, to: number] {
  const p = clampPage(page)
  const size = clampPageSize(pageSize, max)
  const from = (p - 1) * size
  return [from, from + size - 1]
}

/** Number of pages for a filtered total at a given page size (≥ 1). */
export function pageCount(total: number, pageSize: number): number {
  const size = clampPageSize(pageSize)
  if (total <= 0) return 1
  return Math.max(1, Math.ceil(total / size))
}

/**
 * Sanitise a free-text search term for safe embedding inside a PostgREST
 * `.or("col.ilike.%term%,…")` filter string. Commas and parentheses are logical
 * syntax in the or-tree, so they must never reach it as literal search
 * characters — they're stripped (not escaped: this is a substring search box,
 * dropping punctuation is fine and avoids a malformed filter). Leading/trailing
 * whitespace is trimmed. Returns `""` when nothing usable remains, so callers can
 * skip the search clause entirely.
 */
export function sanitizeSearchTerm(term: string | undefined | null): string {
  if (!term) return ""
  return term.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim()
}
