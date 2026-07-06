import type { ForecastData } from "@/lib/data/forecast"

/**
 * The compact slice of the forecast the dashboard tile renders. Every figure is
 * already FX-normalised into `currency` by the forecast data layer — this view
 * only picks the current-quarter (+ next-quarter) totals; it never aggregates.
 *
 * This lives in a plain (non-"use client") module so a server component can call
 * `selectForecastTile()` directly and pass the result to the client `ForecastTile`.
 */
export interface ForecastTileData {
  /** Σ closed-won this quarter (committed revenue), in `currency`. */
  committed: number
  /** Σ open × probability closing this quarter (weighted forecast), in `currency`. */
  weighted: number
  /** Weighted forecast for next quarter, in `currency`. */
  weightedNextQuarter: number
  /** Reporting currency all figures are normalised into. */
  currency: string
  /** Per-currency subtotals dropped for lacking an FX rate — surfaced, not hidden. */
  unconvertibleCount: number
}

/**
 * Thin selector over the shared forecast aggregates: pick the current-quarter
 * committed/weighted totals (and next-quarter weighted) straight from
 * `getForecastData`. No new aggregation — the SQL layer already did it.
 */
export function selectForecastTile(data: ForecastData): ForecastTileData {
  return {
    committed: data.committedThisQuarter,
    weighted: data.weightedThisQuarter,
    weightedNextQuarter: data.weightedNextQuarter,
    currency: data.currency,
    unconvertibleCount: data.unconvertibleCount,
  }
}
