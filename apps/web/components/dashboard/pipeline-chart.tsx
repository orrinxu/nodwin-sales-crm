"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import type { PipelineStageSummary } from "@/lib/data/metrics"
import { stageChartColor } from "@/components/primitives/chart-theme"

function getStageColor(stage: string): string {
  return stageChartColor(stage)
}

function formatChartCurrency(value: number, currency: string, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    notation: "compact",
  })
  return formatter.format(value)
}

function CustomTooltip({
  active,
  payload,
  currency,
  locale,
}: {
  active?: boolean
  payload?: Array<{ payload: PipelineStageSummary }>
  currency: string
  locale: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-medium">{d.label}</p>
      <p>{d.count} opportunities</p>
      <p>{formatChartCurrency(d.amount, currency, locale)}</p>
    </div>
  )
}

interface PipelineChartProps {
  stages: PipelineStageSummary[]
  currency: string
  locale: string
}

export function PipelineChart({ stages, currency, locale }: PipelineChartProps) {
  const chartData = stages.map((s) => ({
    label: s.label,
    count: s.count,
    amount: s.amount,
    stage: s.stage,
  }))

  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="mb-4 text-lg font-semibold">Pipeline by Stage</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm text-muted-foreground">Deal Count</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                angle={-30}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                allowDecimals={false}
              />
              <Tooltip
                content={<CustomTooltip currency={currency} locale={locale} />}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.stage} fill={getStageColor(entry.stage)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h3 className="mb-2 text-sm text-muted-foreground">Total Value</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                angle={-30}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickFormatter={(v: number) =>
                  formatChartCurrency(v, currency, locale)
                }
              />
              <Tooltip
                content={<CustomTooltip currency={currency} locale={locale} />}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.stage} fill={getStageColor(entry.stage)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
