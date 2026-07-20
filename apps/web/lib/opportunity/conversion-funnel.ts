import type { DealStage } from "./stage"
import { getStageLabel } from "@/lib/data/opportunities.types"

/**
 * Conversion-by-Stage funnel (SOW §17) — a current-snapshot view of how deals
 * progress through the pipeline.
 *
 * SEMANTICS — snapshot, not cohort. We infer "how many deals have reached at
 * least stage S" from each deal's CURRENT stage: a deal now in `negotiate` has
 * necessarily passed qualify → meet → propose → negotiate, and a `closed_won`
 * deal has passed everything. So the count that has reached stage S is the sum
 * of the current counts of S and every later funnel stage — a monotonically
 * non-increasing series that reads as a funnel.
 *
 * `closed_lost` is deliberately EXCLUDED from the funnel BARS: a lost deal was
 * lost from some earlier stage we cannot recover from its current stage alone
 * (`opportunity_stage_history` can't fill the gap — its RLS is scoped to
 * `created_by`, so it is not a reliable org-wide source). Lost deals are
 * surfaced separately as context via `lostCount`.
 *
 * But a lost deal DID enter the funnel — it reached at least `qualify` before it
 * was lost. So the honest "deals entered" total and the overall conversion rate
 * must count it: `enteredCount = topCount + lostCount`, and `overallConversion =
 * won ÷ entered`. Dividing won by the funnel-bar total alone (lost excluded)
 * would report 100% for a rep who won 1 of 10 and lost the other 9 (ORR-813) —
 * losing more deals would *raise* the number. Only the bars stay lost-free; the
 * headline denominator does not.
 *
 * This is a pure module (no "use client", no server-only) so the aggregation is
 * unit-testable and callable from either side of the RSC boundary.
 */

/** Funnel stages in progression order — closed_won is the terminal "converted"
 *  step; closed_lost is intentionally not part of the funnel. */
export const FUNNEL_STAGES = [
  "qualify",
  "meet_and_present",
  "propose",
  "negotiate",
  "verbal_agreement",
  "closed_won",
] as const

export type FunnelStage = (typeof FUNNEL_STAGES)[number]

export interface ConversionFunnelStage {
  stage: FunnelStage
  label: string
  /** Deals that have reached at least this stage (this stage + all later ones). */
  reached: number
  /** reached ÷ top-of-funnel, as a whole-number percentage (0 when the funnel is empty). */
  pctOfTop: number
  /** Step conversion from the previous stage, whole-number %; null for the first stage. */
  conversionFromPrev: number | null
}

export interface ConversionFunnelData {
  stages: ConversionFunnelStage[]
  /** Sum of the funnel bars — deals still in the funnel or won (lost excluded).
   *  This is the 100%-denominator for every bar's `pctOfTop`, NOT the honest
   *  "entered" total; use {@link enteredCount} for that. */
  topCount: number
  /** Deals that entered the funnel and are still live or resolved either way —
   *  `topCount + lostCount`. The honest denominator for {@link overallConversion}
   *  and the "N entered" headline. */
  enteredCount: number
  /** Deals that reached closed_won. */
  wonCount: number
  /** Closed-lost deals — shown as context, not part of the funnel bars, but
   *  counted in {@link enteredCount}. */
  lostCount: number
  /** wonCount ÷ enteredCount as a whole-number percentage (0 when nothing
   *  entered). Includes lost in the denominator so it can never exceed 100%. */
  overallConversion: number
}

/** Whole-number percentage of `part` over `whole` (0 when `whole` is 0). */
function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

/**
 * Build the conversion funnel from current per-stage deal counts. Missing stages
 * default to 0, so callers can pass a partial map straight from a GROUP BY.
 */
export function buildConversionFunnel(
  countByStage: Partial<Record<DealStage, number>>,
): ConversionFunnelData {
  const count = (s: DealStage): number =>
    // eslint-disable-next-line security/detect-object-injection -- key is a DealStage constant, never user input
    countByStage[s] ?? 0

  // "reached" for a stage = Σ current counts of that stage and every later funnel
  // stage. Walk the funnel from the tail so a single running sum yields each.
  let running = 0
  const reachedByStage = new Map<FunnelStage, number>()
  for (const stage of [...FUNNEL_STAGES].reverse()) {
    running += count(stage)
    reachedByStage.set(stage, running)
  }

  // After the tail-to-head walk, `running` is the sum of every funnel stage —
  // i.e. the reached count of the first stage, the top of the funnel.
  const topCount = running
  const wonCount = count("closed_won")
  const lostCount = count("closed_lost")
  // Every lost deal entered the funnel too, so it belongs in the honest total.
  const enteredCount = topCount + lostCount

  const stages: ConversionFunnelStage[] = FUNNEL_STAGES.map((stage, i) => {
    const reached = reachedByStage.get(stage) ?? 0
    const prevStage = i === 0 ? undefined : FUNNEL_STAGES.at(i - 1)
    const prevReached = prevStage ? (reachedByStage.get(prevStage) ?? 0) : null
    return {
      stage,
      label: getStageLabel(stage),
      reached,
      pctOfTop: pct(reached, topCount),
      conversionFromPrev: prevReached === null ? null : pct(reached, prevReached),
    }
  })

  return {
    stages,
    topCount,
    enteredCount,
    wonCount,
    lostCount,
    overallConversion: pct(wonCount, enteredCount),
  }
}
