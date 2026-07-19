/**
 * Scope presets for the unified Opportunities surface (ORR-711).
 *
 * "Pipeline" and "Opportunities" used to be two routes rendering the same
 * `OpportunitiesView` with different defaults. They are now one surface with two
 * orthogonal controls: the View axis (Board/Table) and these Scope chips.
 *
 * Each preset is a CODE-DEFINED combination — there is no scope/preset table.
 * A preset maps to an owner-scope (`mine`/`all`, applied server-side as a
 * narrowing filter ON TOP of RLS — never widening) plus optional extra filters
 * (e.g. a close-date window). This module is pure data + pure helpers so it can
 * be imported by both the server page and the client view.
 *
 * "My Team" is intentionally NOT a preset yet: only a single-level, sparsely
 * populated `users.manager_user_id` exists today, so a reporting-line scope is
 * deferred until the org hierarchy is modelled (ORR-711 gate G5).
 */

export type OpportunityScopeKey = "my-pipeline" | "all-deals" | "closing-this-month"
export type OpportunityViewKey = "board" | "table"

/** Owner-scope understood by `getOpportunities` today. */
export type OwnerScope = "mine" | "all"

export interface ScopePreset {
  key: OpportunityScopeKey
  /** Chip label. */
  label: string
  /** Owner-scope passed to `getOpportunities`. */
  ownerScope: OwnerScope
  /** When true, the surface additionally narrows to deals closing this month. */
  closingThisMonth?: boolean
  /** Page header title. */
  title: string
  /** Page header description. */
  description: string
  /** View this preset opens on when the URL doesn't pin one. */
  defaultView: OpportunityViewKey
  /**
   * Saved-views bucket. The `saved_views` table only allows `mine`/`all`, so a
   * date-narrowed preset reuses its owner-scope bucket.
   */
  savedViewScope: OwnerScope
  /** Dedicated empty-state copy (only meaningful for owner-narrowed presets). */
  emptyState?: { title: string; description?: string }
}

export const SCOPE_PRESETS: Record<OpportunityScopeKey, ScopePreset> = {
  "my-pipeline": {
    key: "my-pipeline",
    label: "My Pipeline",
    ownerScope: "mine",
    title: "My Pipeline",
    description:
      "Your deals — the ones you own. Drag between stages to update status.",
    defaultView: "board",
    savedViewScope: "mine",
    emptyState: {
      title: "You don't own any deals yet",
      description:
        "Deals you own show up here as your personal working board. Create one to get started.",
    },
  },
  "all-deals": {
    key: "all-deals",
    label: "All Deals",
    ownerScope: "all",
    title: "Opportunities",
    description: "All deals across the group you can access.",
    defaultView: "table",
    savedViewScope: "all",
  },
  "closing-this-month": {
    key: "closing-this-month",
    label: "Closing This Month",
    ownerScope: "all",
    closingThisMonth: true,
    title: "Closing This Month",
    description:
      "Deals you can access with a close date in the current month.",
    defaultView: "table",
    savedViewScope: "all",
  },
}

/** Chip render order. */
export const SCOPE_PRESET_ORDER: OpportunityScopeKey[] = [
  "my-pipeline",
  "all-deals",
  "closing-this-month",
]

/** Default landing preset (the old "Pipeline" home). */
export const DEFAULT_SCOPE_KEY: OpportunityScopeKey = "my-pipeline"

export function parseScopeKey(value: string | undefined): OpportunityScopeKey {
  return value != null && value in SCOPE_PRESETS
    ? (value as OpportunityScopeKey)
    : DEFAULT_SCOPE_KEY
}

/** Returns the pinned view, or `undefined` to fall back to the preset default. */
export function parseViewKey(value: string | undefined): OpportunityViewKey | undefined {
  return value === "board" || value === "table" ? value : undefined
}

/**
 * Validate a raw `?entity=` value against the caller's own derived entity-scope
 * options (ORR-717). Returns the id only when it matches an option the caller
 * can actually see; a stale, empty, or hand-edited value falls back to
 * `undefined` ("All entities"). Structural `{ id }[]` param so this stays a pure
 * helper importable by both the server page and the client view.
 */
export function resolveEntityScope(
  value: string | undefined,
  options: ReadonlyArray<{ id: string }>,
): string | undefined {
  return value != null && options.some((o) => o.id === value) ? value : undefined
}

/**
 * Today's calendar day as a `YYYY-MM-DD` string, resolved in `timeZone` when
 * given (else the ambient zone). en-CA renders as YYYY-MM-DD; the timeZone pins
 * the calendar day correctly regardless of the server's own zone. Used both for
 * the "Closing This Month" preset bounds and to stamp `close_date` when a deal
 * transitions into a closed stage (ORR-797).
 */
export function todayInTimeZone(timeZone?: string | null): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/**
 * First and last calendar day (inclusive) of the current month, as `YYYY-MM-DD`
 * strings, resolved in `timeZone` when given (else the ambient zone). Used to
 * bound the `close_date` filter for the "Closing This Month" preset.
 */
export function currentMonthRange(timeZone?: string | null): {
  from: string
  to: string
} {
  const today = todayInTimeZone(timeZone)
  const [year, month] = today.split("-").map(Number)
  const mm = String(month).padStart(2, "0")
  // Day 0 of the next month (month is 1-based here, 0-based in Date.UTC) = last
  // day of this month.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  }
}
