import type { DashboardLayout } from "@/lib/data/dashboard-layout"

/**
 * The dashboard's widget catalogue and the default grid layout. Pure module so
 * the layout reconciliation is unit-testable and shared by the server page
 * (default) and the client grid (merge saved with current).
 *
 * Grid is 12 columns wide; `rowSpan` is in grid row-units. Order here is the
 * default top-to-bottom order.
 */

export interface WidgetSpec {
  id: string
  /** Human label shown on the drag chrome in edit mode. */
  title: string
  defaultColSpan: number
  defaultRowSpan: number
  /**
   * Floor for rowSpan, enforced on load even against a saved layout. For
   * content-height widgets (the KPI strip) that would clip/overflow their tile
   * borders if made shorter than the content needs. Defaults to 1.
   */
  minRowSpan?: number
}

export const DASHBOARD_WIDGETS: WidgetSpec[] = [
  { id: "needs-attention", title: "Needs my attention", defaultColSpan: 12, defaultRowSpan: 3 },
  { id: "summary-strip", title: "Summary", defaultColSpan: 12, defaultRowSpan: 3, minRowSpan: 3 },
  { id: "forecast", title: "Quarter forecast", defaultColSpan: 6, defaultRowSpan: 3 },
  { id: "leaderboard", title: "Team leaderboard", defaultColSpan: 6, defaultRowSpan: 3 },
  { id: "conversion-funnel", title: "Conversion by stage", defaultColSpan: 6, defaultRowSpan: 4 },
  { id: "stuck-deals", title: "Stuck deals", defaultColSpan: 6, defaultRowSpan: 4 },
  { id: "pipeline-chart", title: "Pipeline by stage", defaultColSpan: 12, defaultRowSpan: 6 },
  { id: "activity", title: "Recent activity", defaultColSpan: 6, defaultRowSpan: 6 },
  { id: "recent-deals", title: "Recent deals", defaultColSpan: 6, defaultRowSpan: 6 },
]

export const MAX_COLS = 12
export const MAX_ROWS = 12

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** The pristine default layout, in catalogue order. */
export function defaultLayout(specs: WidgetSpec[] = DASHBOARD_WIDGETS): DashboardLayout {
  return specs.map((s) => ({
    id: s.id,
    colSpan: s.defaultColSpan,
    rowSpan: s.defaultRowSpan,
  }))
}

/**
 * Reconcile a saved layout with the current widget catalogue so the grid is
 * always consistent with the widgets that actually exist:
 *   - keep saved widgets (in saved order) with their spans, clamped to bounds,
 *   - drop saved entries whose widget no longer exists,
 *   - append widgets added since the layout was saved, at the end, with defaults.
 * A null/empty saved layout yields the default.
 */
export function mergeLayout(
  saved: DashboardLayout | null | undefined,
  specs: WidgetSpec[] = DASHBOARD_WIDGETS,
): DashboardLayout {
  if (!saved || saved.length === 0) return defaultLayout(specs)

  const specById = new Map(specs.map((s) => [s.id, s]))
  const result: DashboardLayout = []
  const placed = new Set<string>()

  for (const entry of saved) {
    const spec = specById.get(entry.id)
    if (!spec || placed.has(entry.id)) continue
    placed.add(entry.id)
    result.push({
      id: entry.id,
      colSpan: clamp(entry.colSpan, 1, MAX_COLS),
      rowSpan: clamp(entry.rowSpan, spec.minRowSpan ?? 1, MAX_ROWS),
    })
  }

  // Widgets introduced after this layout was saved — append with their defaults.
  for (const spec of specs) {
    if (placed.has(spec.id)) continue
    result.push({
      id: spec.id,
      colSpan: spec.defaultColSpan,
      rowSpan: spec.defaultRowSpan,
    })
  }

  return result
}
