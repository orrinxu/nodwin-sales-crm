import "server-only"
import { DEAL_STAGES } from "@/lib/opportunity"
import type { DealStage } from "@/lib/opportunity"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"
import { fetchAndConvert, resolveReportingCurrency } from "./metrics"
import type { DashboardContext } from "./metrics"

// Per-stage column totals for the pipeline board.
//
// FX (landmine): opportunities carry an amount in their own currency. We NEVER
// sum mixed currencies raw. Every amount is normalised into the viewer's
// reporting currency through the shared FX path (fetchAndConvert →
// lib/money/convert) BEFORE it is added into a stage bucket. Amounts with no FX
// rate to the reporting currency are dropped by fetchAndConvert and surfaced via
// unconvertibleCount — never silently summed as zero (mirrors metrics/forecast).
//
// SCOPE: the caller passes the already-scoped opportunity list (mine vs all),
// so the totals always reflect exactly the set the board renders.

export interface StageTotal {
  /** Number of convertible deals folded into this stage's money totals. */
  count: number
  /** Σ converted amount, in the reporting currency (decimal units). */
  total: number
  /** Σ (converted amount × probabilityPct / 100), in the reporting currency. */
  weighted: number
}

export type StageTotalsByStage = Record<DealStage, StageTotal>

export interface StageTotals {
  currency: string
  byStage: StageTotalsByStage
  /** Deals skipped because their currency had no FX rate to the reporting
   *  currency — surfaced, never silently zeroed. */
  unconvertibleCount: number
}

/** A row that has already been FX-normalised into a single reporting currency. */
export interface ConvertedStageRow {
  stage: string
  amount: number
  probabilityPct: number
}

/**
 * Pure fold of FX-normalised rows into per-stage count / total / weighted.
 *
 * Rows must already be converted into one reporting currency (mixed currencies
 * are never combined here). Weighting uses each row's `probabilityPct`. Rows
 * whose stage is not a known DealStage are ignored defensively (the DB
 * constrains stage to the enum, so this only guards against bad callers).
 */
export function aggregateStageTotals(
  rows: ConvertedStageRow[],
): StageTotalsByStage {
  const acc = new Map<DealStage, StageTotal>()
  for (const stage of DEAL_STAGES) {
    acc.set(stage, { count: 0, total: 0, weighted: 0 })
  }
  for (const row of rows) {
    const bucket = acc.get(row.stage as DealStage)
    if (!bucket) continue
    bucket.count += 1
    bucket.total += row.amount
    bucket.weighted += row.amount * (row.probabilityPct / 100)
  }
  return Object.fromEntries(acc) as StageTotalsByStage
}

/**
 * FX-normalised per-stage aggregates for a scoped opportunity set.
 *
 * Converts each opportunity's amount into the viewer's reporting currency
 * through the shared FX path, then folds the converted rows per stage. The
 * conversion is done over the bounded, already-fetched list — no extra DB
 * scan of opportunity rows.
 */
export async function getStageTotals(
  ctx: DashboardContext,
  opportunities: OpportunityRecord[],
): Promise<StageTotals> {
  const reportingCurrency = await resolveReportingCurrency(ctx)

  const { converted, unconvertibleCount } = await fetchAndConvert(
    opportunities.map((o) => ({
      stage: o.stage,
      amount: Number(o.amount),
      currency: o.currency,
      close_date: o.closeDate,
      probabilityPct: o.probabilityPct,
    })),
    reportingCurrency,
  )

  return {
    currency: reportingCurrency,
    byStage: aggregateStageTotals(converted),
    unconvertibleCount,
  }
}
