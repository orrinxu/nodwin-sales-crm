import type { CSSProperties } from "react"

import { STAGE, STAGE_FALLBACK_CHART, getStageColors } from "@/lib/theme/stage"

/**
 * Chart colour helpers — the single place recharts components pull fills from,
 * sharing the SAME {@link STAGE} map as <StageBadge> so a stage always reads the
 * same colour whether it appears as a pill or a bar.
 */

/** Solid fill for a bar/cell keyed by a (possibly non-canonical) stage string. */
export function stageChartColor(stage: string): string {
  return getStageColors(stage)?.chartSolid ?? STAGE_FALLBACK_CHART
}

/**
 * Semantic series colours for non-stage aggregates (won/lost/open rollups,
 * created-vs-won trend lines, etc.). Won/Lost reuse the closed_* stage colours
 * so the whole app stays consistent.
 */
export const CHART_SERIES = {
  created: "var(--color-info)",
  won: STAGE.closed_won.chartSolid,
  lost: STAGE.closed_lost.chartSolid,
  neutral: STAGE_FALLBACK_CHART,
} as const

/** Shared recharts tooltip container style, wired to popover tokens. */
export const chartTooltipStyle: CSSProperties = {
  background: "var(--color-popover)",
  color: "var(--color-popover-foreground)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius)",
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
}
