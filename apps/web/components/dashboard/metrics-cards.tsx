"use client"

import { TrendingUp, CheckCircle2, XCircle, DollarSign, Percent, AlertTriangle } from "lucide-react"
import type { PipelineMetrics } from "@/lib/data/metrics"
import { cn } from "@/lib/utils"

interface MetricsCardsProps {
  metrics: PipelineMetrics
  locale: string
}

function fmt(value: number, currency: string, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  })
  return formatter.format(value)
}

export function MetricsCards({ metrics, locale }: MetricsCardsProps) {
  const cards = [
    {
      label: "Pipeline Value",
      value: fmt(metrics.pipelineValue, metrics.currency, locale),
      icon: DollarSign,
    },
    {
      label: "Deals Won",
      value: metrics.dealsWon.toString(),
      icon: CheckCircle2,
      color: "text-success-fg",
    },
    {
      label: "Deals Lost",
      value: metrics.dealsLost.toString(),
      icon: XCircle,
      color: "text-destructive",
    },
    {
      label: "Win Rate",
      value: `${metrics.winRate}%`,
      icon: Percent,
    },
    {
      label: "Avg Deal Size",
      value: fmt(metrics.avgDealSize, metrics.currency, locale),
      icon: TrendingUp,
    },
  ]

  if (metrics.unconvertibleCount > 0) {
    cards.push({
      label: "Non-INR Deals",
      value: metrics.unconvertibleCount.toString(),
      icon: AlertTriangle,
      color: "text-amber-500",
    })
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className="rounded-lg border bg-card p-4 text-card-foreground"
          >
            <div className="flex items-center gap-2">
              <Icon
                className={cn("size-4 text-muted-foreground", card.color)}
              />
              <p className="text-sm text-muted-foreground">{card.label}</p>
            </div>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
          </div>
        )
      })}
    </div>
  )
}
