import type { DealStage } from "@/lib/opportunity/stage"

/**
 * Per-stage colour triplet. Every value is a CSS `var()` reference into the
 * fixed 7-stage ramp declared in `app/globals.css` (`--stage-<id>-*`), so the
 * light/dark values live in ONE place (CSS) and this map is the single
 * TypeScript source of truth that components read.
 *
 * - `badgeBg` / `badgeFg` — the subtle pill background + readable foreground
 *   used by <StageBadge>.
 * - `chartSolid` — the saturated fill used by recharts series / cells.
 */
export interface StageColors {
  badgeBg: string
  badgeFg: string
  chartSolid: string
}

export const STAGE: Record<DealStage, StageColors> = {
  qualify: {
    badgeBg: "var(--stage-qualify-badge-bg)",
    badgeFg: "var(--stage-qualify-badge-fg)",
    chartSolid: "var(--stage-qualify-chart)",
  },
  meet_and_present: {
    badgeBg: "var(--stage-meet_and_present-badge-bg)",
    badgeFg: "var(--stage-meet_and_present-badge-fg)",
    chartSolid: "var(--stage-meet_and_present-chart)",
  },
  propose: {
    badgeBg: "var(--stage-propose-badge-bg)",
    badgeFg: "var(--stage-propose-badge-fg)",
    chartSolid: "var(--stage-propose-chart)",
  },
  negotiate: {
    badgeBg: "var(--stage-negotiate-badge-bg)",
    badgeFg: "var(--stage-negotiate-badge-fg)",
    chartSolid: "var(--stage-negotiate-chart)",
  },
  verbal_agreement: {
    badgeBg: "var(--stage-verbal_agreement-badge-bg)",
    badgeFg: "var(--stage-verbal_agreement-badge-fg)",
    chartSolid: "var(--stage-verbal_agreement-chart)",
  },
  closed_won: {
    badgeBg: "var(--stage-closed_won-badge-bg)",
    badgeFg: "var(--stage-closed_won-badge-fg)",
    chartSolid: "var(--stage-closed_won-chart)",
  },
  closed_lost: {
    badgeBg: "var(--stage-closed_lost-badge-bg)",
    badgeFg: "var(--stage-closed_lost-badge-fg)",
    chartSolid: "var(--stage-closed_lost-chart)",
  },
}

/** Neutral fallback colour for unknown / non-stage keys. */
export const STAGE_FALLBACK_CHART = "var(--color-muted-foreground)"

/**
 * Resolve stage colours from an arbitrary string (e.g. a DB value that may not
 * be a canonical stage). Returns `undefined` when the key is not a known stage.
 */
export function getStageColors(stage: string): StageColors | undefined {
  if (Object.prototype.hasOwnProperty.call(STAGE, stage)) {
    return STAGE[stage as DealStage]
  }
  return undefined
}
