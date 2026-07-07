"use client"

import { TrendingUp, CircleDollarSign, CalendarClock } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { KpiCard } from "@/components/primitives/kpi-card"
import { EmptyState } from "@/components/primitives/empty-state"
import type { ForecastTileData } from "./forecast-tile-data"

interface ForecastTileProps {
  data: ForecastTileData
  /** Intl locale for digit grouping (thousands vs lakh/crore). */
  locale: string
}

/**
 * Dashboard forecast tile — surfaces this-quarter committed (closed-won) and
 * weighted (probability-adjusted open) revenue so forecasting isn't buried in
 * Reports. Values arrive FX-normalised; this component only formats them.
 */
export function ForecastTile({ data, locale }: ForecastTileProps) {
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: data.currency,
    maximumFractionDigits: 0,
  })

  const isEmpty =
    data.committed === 0 && data.weighted === 0 && data.weightedNextQuarter === 0

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" /> Quarter forecast
          </CardTitle>
          <CardDescription>
            Committed and weighted revenue for this quarter — in {data.currency}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            icon={TrendingUp}
            title="No forecast yet"
            description="Committed and weighted revenue appear once deals close or advance this quarter."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KpiCard
                label="Committed — this quarter"
                value={fmt.format(data.committed)}
                icon={CircleDollarSign}
                hint="Closed-won this quarter"
              />
              <KpiCard
                label="Weighted — this quarter"
                value={fmt.format(data.weighted)}
                icon={TrendingUp}
                hint="Σ probability × open amount"
              />
              <KpiCard
                label="Weighted — next quarter"
                value={fmt.format(data.weightedNextQuarter)}
                icon={CalendarClock}
                hint="Probability-adjusted, next quarter"
              />
            </div>
            {data.unconvertibleCount > 0 ? (
              <p className="mt-3 text-caption text-muted-foreground">
                {data.unconvertibleCount} currency subtotal
                {data.unconvertibleCount === 1 ? "" : "s"} excluded — no FX rate to{" "}
                {data.currency}.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
