"use client"

import { useState } from "react"
import { Trophy } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmptyState } from "@/components/primitives/empty-state"
import { cn } from "@/lib/utils"
import { rankLeaderboard, LEADERBOARD_METRICS } from "./rep-leaderboard-data"
import type { LeaderboardMetric } from "./rep-leaderboard-data"
import type { RepScorecardRow } from "@/lib/data/forecast"

interface RepLeaderboardProps {
  scorecard: RepScorecardRow[]
  /** The signed-in user's id — their row is highlighted. */
  currentUserId: string
  /** Reporting currency the money metrics are normalised into. */
  currency: string
  /** Intl locale for digit grouping. */
  locale: string
  /** What population the leaderboard ranks — "Team" (reporting subtree) or
   *  "Group" (region/org rollup). Titles the card honestly; the same widget
   *  serves both the dashboard Team and Group tabs (ORR-813). Defaults to
   *  "Team" for existing call sites. */
  scopeLabel?: string
}

const MEDALS = ["🥇", "🥈", "🥉"] as const

function rankLabel(rank: number): string {
  return MEDALS.at(rank - 1) ?? String(rank)
}

/**
 * Rep leaderboard — ranks the top reps in a scope (Team or Group) by a
 * viewer-selected metric (won revenue / weighted pipeline / win rate). Reuses the
 * forecast scorecard data already loaded for the dashboard, so it adds no new
 * query. The ranking is the pure {@link rankLeaderboard}; this component owns the
 * metric toggle and the presentation (medals, relative bars, and highlighting the
 * signed-in rep).
 *
 * The caption is metric-aware (ORR-813): "Won" and "Win rate" are period metrics
 * (rep_scorecard_agg filters them to this quarter by close_date), so they read
 * "top reps this quarter"; "Weighted" is a live pipeline snapshot (the RPC does
 * NOT period-filter open deals), so it reads "current weighted pipeline" rather
 * than mislabelling all-time pipeline as a quarterly figure.
 */
export function RepLeaderboard({
  scorecard,
  currentUserId,
  currency,
  locale,
  scopeLabel = "Team",
}: RepLeaderboardProps) {
  const [metric, setMetric] = useState<LeaderboardMetric>("won")
  const entries = rankLeaderboard(scorecard, metric, currentUserId)
  const kind =
    LEADERBOARD_METRICS.find((m) => m.key === metric)?.kind ?? "money"
  const caption =
    metric === "weightedPipeline"
      ? "Current weighted pipeline"
      : "Top reps this quarter"

  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  })
  const fmt = (value: number) =>
    kind === "money" ? money.format(value) : `${value}%`

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4 text-primary" /> {scopeLabel} leaderboard
          </CardTitle>
          <CardDescription>{caption}</CardDescription>
        </div>
        <div className="flex rounded-md border p-0.5" role="group" aria-label="Rank by">
          {LEADERBOARD_METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                metric === m.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No reps to rank"
            description="The leaderboard fills in once opportunities are owned."
          />
        ) : (
          <ol className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.ownerId}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-1.5",
                  e.isCurrentUser && "bg-primary/5 ring-1 ring-primary/20",
                )}
              >
                <span className="w-6 shrink-0 text-center text-sm tabular-nums">
                  {rankLabel(e.rank)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {e.ownerName}
                      {e.isCurrentUser ? (
                        <span className="ml-1 text-caption text-muted-foreground">
                          (you)
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">
                      {fmt(e.value)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(e.pctOfLeader, 2)}%` }}
                      aria-hidden
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
