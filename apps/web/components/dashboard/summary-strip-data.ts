import type { PipelineMetrics } from "@/lib/data/metrics"
import type { ForecastTileData } from "./forecast-tile-data"

/**
 * The headline figures the dashboard summary strip renders — the single row at
 * the top of the dashboard that tells the whole story at a glance. Every money
 * figure is already FX-normalised into `currency` by the data layer; this view
 * only picks and co-locates them, it never aggregates.
 *
 * Like {@link ForecastTileData} this lives in a plain (non-"use client") module
 * so the server component can call `selectSummaryStrip()` directly and pass the
 * result into the client `SummaryStrip`.
 */
export interface SummaryStripData {
  /** Open (non-terminal) pipeline value, in `currency`. */
  pipelineValue: number
  /** Weighted forecast for the current quarter (Σ probability × open), in `currency`. */
  weighted: number
  /** Win rate as a whole-number percentage: won / (won + lost). */
  winRate: number
  dealsWon: number
  dealsLost: number
  /** Average value of active + won deals, in `currency`. */
  avgDealSize: number
  /** Reporting currency all money figures are normalised into. */
  currency: string
  /** Per-currency subtotals dropped for lacking an FX rate — surfaced, not hidden. */
  unconvertibleCount: number
}

/**
 * Combine the pipeline metrics with the current-quarter weighted forecast into
 * the compact summary-strip view model. Both inputs are already resolved into
 * the same reporting currency, so no conversion happens here.
 */
export function selectSummaryStrip(
  metrics: PipelineMetrics,
  forecast: ForecastTileData,
): SummaryStripData {
  return {
    pipelineValue: metrics.pipelineValue,
    weighted: forecast.weighted,
    winRate: metrics.winRate,
    dealsWon: metrics.dealsWon,
    dealsLost: metrics.dealsLost,
    avgDealSize: metrics.avgDealSize,
    currency: metrics.currency,
    unconvertibleCount: metrics.unconvertibleCount,
  }
}
