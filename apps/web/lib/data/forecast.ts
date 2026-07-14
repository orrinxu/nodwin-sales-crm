import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { NON_TERMINAL_STAGES, isTerminalStage } from "@/lib/opportunity"
import type { DealStage } from "@/lib/opportunity"
import { getStageLabel } from "@/lib/data/opportunities.types"
import { fetchAndConvert, resolveReportingCurrency } from "./metrics"
import type { DashboardContext } from "./metrics"

// Revenue Forecasting & Rep Scorecards.
//
// CORRECTNESS: every rollup is aggregated in SQL (SECURITY INVOKER functions with
// GROUP BY — see 20260706000000_forecast_scorecard_aggregates.sql). We NEVER
// SELECT raw opportunity rows and reduce() them here: PostgREST's max_rows would
// silently truncate the scan. The functions return AT MOST one row per
// (dimension × currency) group, so the JS below only ever folds a bounded,
// already-aggregated set. Opportunity RLS (incl. the Confidential-tier fence)
// runs inside the SQL functions, so a deal the viewer can't see never reaches us.
//
// FX: the functions aggregate per CURRENCY (never mixing). We normalise each
// per-currency subtotal into the viewer's reporting currency through the shared
// FX path (fetchAndConvert → lib/money/convert.ts) and only then sum across
// currencies. Forecast/committed/scorecard money uses the latest FX rate
// (asOf = today); the revenue curve uses each month's rate.

export type ForecastPeriod = "this_quarter" | "next_quarter"

export interface ForecastPeriodBreakdown {
  period: ForecastPeriod
  label: string
  weighted: number
  committed: number
  openPipeline: number
}

export interface ForecastStageBreakdown {
  stage: DealStage
  label: string
  weighted: number
}

export interface RevenuePoint {
  month: string
  amount: number
}

export interface RepScorecardRow {
  ownerId: string | null
  ownerName: string
  openPipeline: number
  weightedPipeline: number
  won: number
  /** Win rate 0–100, or null when the rep closed nothing in the period. */
  winRate: number | null
  /** Average sales cycle in days, or null when no won deals in the period. */
  avgSalesCycleDays: number | null
}

export interface ForecastData {
  currency: string
  weightedThisQuarter: number
  committedThisQuarter: number
  weightedNextQuarter: number
  openPipelineTotal: number
  weightedPipelineTotal: number
  periodBreakdown: ForecastPeriodBreakdown[]
  stageBreakdown: ForecastStageBreakdown[]
  revenueCurve: RevenuePoint[]
  scorecard: RepScorecardRow[]
  /** Per-currency subtotals dropped because they had no FX rate to the reporting
   *  currency — surfaced, never silently hidden (mirrors stuck-deals). */
  unconvertibleCount: number
}

/** Quarter boundaries as UTC calendar dates (YYYY-MM-DD). Half-open intervals:
 *  [thisQuarterStart, thisQuarterEnd) and [thisQuarterEnd, nextQuarterEnd). */
export function quarterBoundaries(now: Date): {
  thisQuarterStart: string
  thisQuarterEnd: string
  nextQuarterEnd: string
} {
  const year = now.getUTCFullYear()
  const q = Math.floor(now.getUTCMonth() / 3) // 0..3
  const startMonth = q * 3
  const toIso = (y: number, m0: number) =>
    `${y}-${String(m0 + 1).padStart(2, "0")}-01`
  const start = toIso(year, startMonth)
  const end = toIso(startMonth + 3 >= 12 ? year + 1 : year, (startMonth + 3) % 12)
  const nextEnd = toIso(
    startMonth + 6 >= 12 ? year + 1 : year,
    (startMonth + 6) % 12,
  )
  return { thisQuarterStart: start, thisQuarterEnd: end, nextQuarterEnd: nextEnd }
}

const PERIOD_LABELS = new Map<ForecastPeriod, string>([
  ["this_quarter", "This quarter"],
  ["next_quarter", "Next quarter"],
])

type Bucket<M> = M & { currency: string; amount: number; asOf: string | null }

/**
 * FX-normalise a set of per-currency subtotals via the shared conversion path,
 * preserving each bucket's dimension metadata. Buckets whose currency has no rate
 * to the reporting currency are dropped and counted (never silently summed as 0).
 */
async function convertBuckets<M>(
  buckets: Array<Bucket<M>>,
  reportingCurrency: string,
): Promise<{ rows: Array<M & { amount: number }>; unconvertibleCount: number }> {
  // fetchAndConvert's OpportunityRaw needs a `stage` field but never reads it for
  // FX math (only currency/amount/close_date). Preserve the bucket's own stage
  // dimension when present; fall back to "" otherwise. All other metadata rides
  // through the spread and survives the conversion untouched.
  const { converted, unconvertibleCount } = await fetchAndConvert(
    buckets.map((b) => {
      const stage = (b as { stage?: unknown }).stage
      return {
        ...b,
        close_date: b.asOf,
        stage: typeof stage === "string" ? stage : "",
      }
    }),
    reportingCurrency,
  )
  return {
    rows: converted as unknown as Array<M & { amount: number }>,
    unconvertibleCount,
  }
}

function num(v: number | string | null | undefined): number {
  return typeof v === "number" ? v : Number(v ?? 0)
}

/** One raw row of `rep_scorecard_agg` (per owner × currency), pre-FX. */
interface ScorecardAggRow {
  owner_user_id: string | null
  owner_name: string | null
  currency: string
  open_amount: number | string | null
  weighted_amount: number | string | null
  won_amount: number | string | null
  won_count: number | string | null
  lost_count: number | string | null
  cycle_days_sum: number | string | null
}

/**
 * Fold the per-(owner × currency) scorecard rows into one FX-normalised row per
 * owner, sorted by weighted pipeline desc. Shared by the org-wide forecast and
 * the team-scoped leaderboard (ORR-722) so both apply identical FX + win-rate +
 * cycle math. Only the WON subtotal contributes to `unconvertibleCount`, matching
 * the original inline behaviour.
 */
async function foldScorecard(
  scorecardRows: ScorecardAggRow[],
  reportingCurrency: string,
): Promise<{ scorecard: RepScorecardRow[]; unconvertibleCount: number }> {
  const openConv = await convertBuckets(
    scorecardRows.map((r) => ({
      ownerId: r.owner_user_id,
      ownerName: r.owner_name,
      currency: r.currency,
      amount: num(r.open_amount),
      asOf: null,
    })),
    reportingCurrency,
  )
  const repWeightedConv = await convertBuckets(
    scorecardRows.map((r) => ({
      ownerId: r.owner_user_id,
      currency: r.currency,
      amount: num(r.weighted_amount),
      asOf: null,
    })),
    reportingCurrency,
  )
  const wonConv = await convertBuckets(
    scorecardRows.map((r) => ({
      ownerId: r.owner_user_id,
      currency: r.currency,
      amount: num(r.won_amount),
      asOf: null,
    })),
    reportingCurrency,
  )

  const ownerKey = (id: string | null) => id ?? "__unassigned__"
  const scoreAgg = new Map<
    string,
    {
      ownerId: string | null
      ownerName: string
      openPipeline: number
      weightedPipeline: number
      won: number
      wonCount: number
      lostCount: number
      cycleDaysSum: number
    }
  >()

  const ensure = (ownerId: string | null, ownerName: string | null) => {
    const key = ownerKey(ownerId)
    let entry = scoreAgg.get(key)
    if (!entry) {
      entry = {
        ownerId,
        ownerName: ownerName ?? (ownerId ? "Unknown" : "Unassigned"),
        openPipeline: 0,
        weightedPipeline: 0,
        won: 0,
        wonCount: 0,
        lostCount: 0,
        cycleDaysSum: 0,
      }
      scoreAgg.set(key, entry)
    } else if (ownerName && entry.ownerName === "Unknown") {
      entry.ownerName = ownerName
    }
    return entry
  }

  for (const row of openConv.rows) {
    ensure(row.ownerId, row.ownerName).openPipeline += row.amount
  }
  for (const row of repWeightedConv.rows) {
    ensure(row.ownerId, null).weightedPipeline += row.amount
  }
  for (const row of wonConv.rows) {
    ensure(row.ownerId, null).won += row.amount
  }
  // Counts + cycle days are currency-agnostic and additive across currency rows.
  for (const r of scorecardRows) {
    const entry = ensure(r.owner_user_id, r.owner_name)
    entry.wonCount += num(r.won_count)
    entry.lostCount += num(r.lost_count)
    entry.cycleDaysSum += num(r.cycle_days_sum)
  }

  const scorecard: RepScorecardRow[] = [...scoreAgg.values()]
    .map((e) => {
      const closed = e.wonCount + e.lostCount
      return {
        ownerId: e.ownerId,
        ownerName: e.ownerName,
        openPipeline: e.openPipeline,
        weightedPipeline: e.weightedPipeline,
        won: e.won,
        winRate: closed > 0 ? Math.round((e.wonCount / closed) * 100) : null,
        avgSalesCycleDays:
          e.wonCount > 0 ? Math.round(e.cycleDaysSum / e.wonCount) : null,
      }
    })
    .sort((a, b) => b.weightedPipeline - a.weightedPipeline)

  return { scorecard, unconvertibleCount: wonConv.unconvertibleCount }
}

/**
 * Team-scoped rep leaderboard (ORR-722). Same shape and FX handling as the
 * forecast scorecard, but the `rep_scorecard_agg` RPC is called with
 * `p_team_only`, so it aggregates only the caller's reporting subtree (self +
 * recursive direct reports) on top of RLS. Used by the dashboard "Team" tab.
 */
export async function getTeamScorecard(
  ctx: DashboardContext,
): Promise<{ scorecard: RepScorecardRow[]; currency: string; unconvertibleCount: number }> {
  const supabase = await createServerClient()
  const reportingCurrency = await resolveReportingCurrency(ctx)
  const { thisQuarterStart, thisQuarterEnd } = quarterBoundaries(new Date())

  const { data, error } = await supabase.rpc("rep_scorecard_agg", {
    p_period_start: thisQuarterStart,
    p_period_end: thisQuarterEnd,
    p_team_only: true,
  })
  if (error) {
    throw new Error(`Failed to load team scorecard: ${error.message}`)
  }

  const { scorecard, unconvertibleCount } = await foldScorecard(
    (data ?? []) as ScorecardAggRow[],
    reportingCurrency,
  )
  return { scorecard, currency: reportingCurrency, unconvertibleCount }
}

export async function getForecastData(ctx: DashboardContext): Promise<ForecastData> {
  const supabase = await createServerClient()
  const reportingCurrency = await resolveReportingCurrency(ctx)
  const { thisQuarterStart, thisQuarterEnd, nextQuarterEnd } = quarterBoundaries(
    new Date(),
  )

  const [pipelineRes, curveRes, scorecardRes] = await Promise.all([
    supabase.rpc("forecast_pipeline_agg", {
      p_this_quarter_start: thisQuarterStart,
      p_this_quarter_end: thisQuarterEnd,
      p_next_quarter_end: nextQuarterEnd,
    }),
    supabase.rpc("forecast_revenue_curve_agg"),
    supabase.rpc("rep_scorecard_agg", {
      p_period_start: thisQuarterStart,
      p_period_end: thisQuarterEnd,
    }),
  ])

  if (pipelineRes.error) {
    throw new Error(`Failed to load forecast pipeline: ${pipelineRes.error.message}`)
  }
  if (curveRes.error) {
    throw new Error(`Failed to load revenue curve: ${curveRes.error.message}`)
  }
  if (scorecardRes.error) {
    throw new Error(`Failed to load rep scorecard: ${scorecardRes.error.message}`)
  }

  const pipelineRows = pipelineRes.data ?? []
  const curveRows = curveRes.data ?? []
  const scorecardRows = scorecardRes.data ?? []

  let unconvertibleCount = 0

  // ── Forecast: weighted (open) + committed (won) + open pipeline ─────────────
  // Convert weighted and gross subtotals independently (each per currency, at
  // today's rate). Both are linear in the FX rate, so converting the SQL-computed
  // subtotals is exact.
  const weightedConv = await convertBuckets(
    pipelineRows.map((r) => ({
      period: r.period,
      stage: r.stage as DealStage,
      currency: r.currency,
      amount: num(r.weighted_amount),
      asOf: null,
    })),
    reportingCurrency,
  )
  const grossConv = await convertBuckets(
    pipelineRows.map((r) => ({
      period: r.period,
      stage: r.stage as DealStage,
      currency: r.currency,
      amount: num(r.gross_amount),
      asOf: null,
    })),
    reportingCurrency,
  )
  unconvertibleCount += grossConv.unconvertibleCount

  // Keyed by ForecastPeriod via a Map (not a Record) so there is no dynamic
  // object-index sink — 'other' rows are simply ignored (no matching entry).
  const periodAgg = new Map<
    ForecastPeriod,
    { weighted: number; committed: number; openPipeline: number }
  >([
    ["this_quarter", { weighted: 0, committed: 0, openPipeline: 0 }],
    ["next_quarter", { weighted: 0, committed: 0, openPipeline: 0 }],
  ])
  const stageWeighted = new Map<DealStage, number>()
  let openPipelineTotal = 0
  let weightedPipelineTotal = 0

  for (const row of weightedConv.rows) {
    const isOpen = !isTerminalStage(row.stage)
    if (!isOpen) continue
    weightedPipelineTotal += row.amount
    stageWeighted.set(row.stage, (stageWeighted.get(row.stage) ?? 0) + row.amount)
    const bucket = periodAgg.get(row.period as ForecastPeriod)
    if (bucket) bucket.weighted += row.amount
  }
  for (const row of grossConv.rows) {
    const isOpen = !isTerminalStage(row.stage)
    const bucket = periodAgg.get(row.period as ForecastPeriod)
    if (isOpen) {
      openPipelineTotal += row.amount
      if (bucket) bucket.openPipeline += row.amount
    } else if (row.stage === "closed_won") {
      if (bucket) bucket.committed += row.amount
    }
  }

  const periodBreakdown: ForecastPeriodBreakdown[] = (
    ["this_quarter", "next_quarter"] as ForecastPeriod[]
  ).map((period) => {
    const agg = periodAgg.get(period) ?? {
      weighted: 0,
      committed: 0,
      openPipeline: 0,
    }
    return {
      period,
      label: PERIOD_LABELS.get(period) ?? period,
      weighted: agg.weighted,
      committed: agg.committed,
      openPipeline: agg.openPipeline,
    }
  })

  const stageBreakdown: ForecastStageBreakdown[] = NON_TERMINAL_STAGES.map(
    (stage) => ({
      stage,
      label: getStageLabel(stage),
      weighted: stageWeighted.get(stage) ?? 0,
    }),
  ).filter((s) => s.weighted > 0)

  // ── Revenue curve: monthly recognised revenue, per month at that month's rate ─
  const curveConv = await convertBuckets(
    curveRows.map((r) => ({
      month: String(r.month).slice(0, 7),
      currency: r.currency,
      amount: num(r.amount),
      asOf: String(r.month).slice(0, 10),
    })),
    reportingCurrency,
  )
  unconvertibleCount += curveConv.unconvertibleCount

  const monthMap = new Map<string, number>()
  for (const row of curveConv.rows) {
    monthMap.set(row.month, (monthMap.get(row.month) ?? 0) + row.amount)
  }
  const revenueCurve: RevenuePoint[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }))

  // ── Rep scorecard: FX-normalise money per (owner, currency), fold per owner ──
  // Shared with the team-scoped leaderboard (getTeamScorecard) via foldScorecard.
  const { scorecard, unconvertibleCount: scorecardUnconvertible } =
    await foldScorecard(scorecardRows as ScorecardAggRow[], reportingCurrency)
  unconvertibleCount += scorecardUnconvertible

  const thisQ = periodBreakdown.find((p) => p.period === "this_quarter")
  const nextQ = periodBreakdown.find((p) => p.period === "next_quarter")

  return {
    currency: reportingCurrency,
    weightedThisQuarter: thisQ?.weighted ?? 0,
    committedThisQuarter: thisQ?.committed ?? 0,
    weightedNextQuarter: nextQ?.weighted ?? 0,
    openPipelineTotal,
    weightedPipelineTotal,
    periodBreakdown,
    stageBreakdown,
    revenueCurve,
    scorecard,
    unconvertibleCount,
  }
}
