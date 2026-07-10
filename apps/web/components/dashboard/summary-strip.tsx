"use client"

import {
  DollarSign,
  TrendingUp,
  Percent,
  CheckCircle2,
  XCircle,
  Gauge,
  AlertTriangle,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { KpiCard } from "@/components/primitives/kpi-card"
import type { SummaryStripData } from "./summary-strip-data"

interface SummaryStripProps {
  data: SummaryStripData
  /** Intl locale for digit grouping (thousands vs lakh/crore). */
  locale: string
}

interface StripCard {
  label: string
  value: string
  icon: LucideIcon
  hint?: string
}

/**
 * Dashboard summary strip — the headline KPI row at the top of the dashboard.
 * Built on the shared {@link KpiCard} primitive so it reads as one system with
 * the forecast tile and report scorecards. Values arrive FX-normalised into
 * `data.currency`; this component only formats them.
 */
export function SummaryStrip({ data, locale }: SummaryStripProps) {
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: data.currency,
    maximumFractionDigits: 0,
  })

  const cards: StripCard[] = [
    {
      label: "Pipeline Value",
      value: money.format(data.pipelineValue),
      icon: DollarSign,
      hint: "Open deal value",
    },
    {
      label: "Weighted — this quarter",
      value: money.format(data.weighted),
      icon: TrendingUp,
      hint: "Σ probability × open amount",
    },
    {
      label: "Win Rate",
      value: `${data.winRate}%`,
      icon: Percent,
      hint: "Won / (won + lost)",
    },
    {
      label: "Deals Won",
      value: data.dealsWon.toString(),
      icon: CheckCircle2,
    },
    {
      label: "Deals Lost",
      value: data.dealsLost.toString(),
      icon: XCircle,
    },
    {
      label: "Avg Deal Size",
      value: money.format(data.avgDealSize),
      icon: Gauge,
    },
  ]

  if (data.unconvertibleCount > 0) {
    cards.push({
      label: "Unconverted",
      value: data.unconvertibleCount.toString(),
      icon: AlertTriangle,
      hint: `No FX rate to ${data.currency}`,
    })
  }

  return (
    <div className="grid content-start gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
      {cards.map((card) => (
        <KpiCard
          key={card.label}
          label={card.label}
          value={card.value}
          icon={card.icon}
          hint={card.hint}
        />
      ))}
    </div>
  )
}
