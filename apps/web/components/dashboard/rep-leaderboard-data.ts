import type { RepScorecardRow } from "@/lib/data/forecast"

/**
 * Team Leaderboard (SOW §17) — a ranked, at-a-glance view of rep performance,
 * derived from the same {@link RepScorecardRow} data the Reports scorecard uses
 * (already FX-normalised into the reporting currency by the forecast data layer).
 *
 * Pure module (no "use client", no server-only): the ranking is plain array
 * arithmetic over the already-aggregated scorecard (≤ #reps rows — never a raw
 * opportunity scan), so it is unit-testable and safe on either side of the RSC
 * boundary. The client widget re-ranks in place when the viewer flips the metric.
 */

export type LeaderboardMetric = "won" | "weightedPipeline" | "winRate"

export interface LeaderboardEntry {
  ownerId: string
  ownerName: string
  /** 1-based rank within the ranked list. */
  rank: number
  /** The selected metric's value — money (won/weighted) or a 0–100 percentage. */
  value: number
  /** value ÷ leader's value, as a whole-number percentage (bar width; 0 when the leader is 0). */
  pctOfLeader: number
  isCurrentUser: boolean
}

/** Metric labels for the toggle + value formatting hints. */
export const LEADERBOARD_METRICS: { key: LeaderboardMetric; label: string; kind: "money" | "percent" }[] = [
  { key: "won", label: "Won", kind: "money" },
  { key: "weightedPipeline", label: "Weighted", kind: "money" },
  { key: "winRate", label: "Win rate", kind: "percent" },
]

function metricValue(row: RepScorecardRow, metric: LeaderboardMetric): number {
  if (metric === "won") return row.won
  if (metric === "weightedPipeline") return row.weightedPipeline
  return row.winRate ?? 0 // null win rate (closed nothing) ranks as 0
}

/**
 * Rank reps by the chosen metric, highest first, and take the top `limit`.
 *
 * Unassigned rows (`ownerId === null`) are dropped — a leaderboard is of people.
 * Ties break by name (ascending) for a stable order. `pctOfLeader` is relative to
 * the top entry so the bars read as a ranking.
 */
export function rankLeaderboard(
  rows: RepScorecardRow[],
  metric: LeaderboardMetric,
  currentUserId: string,
  limit = 5,
): LeaderboardEntry[] {
  const named = rows.filter(
    (r): r is RepScorecardRow & { ownerId: string } => r.ownerId !== null,
  )

  const sorted = [...named].sort((a, b) => {
    const diff = metricValue(b, metric) - metricValue(a, metric)
    return diff !== 0 ? diff : a.ownerName.localeCompare(b.ownerName)
  })

  const top = sorted.slice(0, limit)
  const leaderValue = top.length > 0 ? metricValue(top[0], metric) : 0

  return top.map((row, i) => {
    const value = metricValue(row, metric)
    return {
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      rank: i + 1,
      value,
      pctOfLeader: leaderValue > 0 ? Math.round((value / leaderValue) * 100) : 0,
      isCurrentUser: row.ownerId === currentUserId,
    }
  })
}
