"use client"

import { TrendingUp, CheckCircle2, XCircle, DollarSign, Percent } from "lucide-react"
import type { SalesMetrics } from "@/lib/data/dashboard"

interface MetricsCardsProps {
  metrics: SalesMetrics
}

function formatCurrency(value: string, currency: string): string {
  const num = parseFloat(value)
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M ${currency}`
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K ${currency}`
  return `${num.toFixed(0)} ${currency}`
}

export function MetricsCards({ metrics }: MetricsCardsProps) {
  const cards = [
    {
      label: "Pipeline Value",
      value: formatCurrency(metrics.pipelineValue, metrics.pipelineCurrency),
      icon: DollarSign,
    },
    {
      label: "Deals Won",
      value: metrics.dealsWon.toString(),
      icon: CheckCircle2,
      color: "text-green-500",
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
      value: formatCurrency(metrics.avgDealSize, metrics.avgDealCurrency),
      icon: TrendingUp,
    },
  ]

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
                className={`size-4 text-muted-foreground ${card.color ?? ""}`}
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
