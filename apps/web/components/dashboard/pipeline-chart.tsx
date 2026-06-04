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
import type { PipelineStageSummary } from "@/lib/data/dashboard"

const CHART_COLORS = {
  active: "var(--chart-2)",
  won: "#22c55e",
  lost: "var(--destructive)",
  default: "var(--chart-1)",
}

function getStageColor(stage: string): string {
  if (stage === "closed_won") return CHART_COLORS.won
  if (stage === "closed_lost") return CHART_COLORS.lost
  return CHART_COLORS.default
}

function formatChartCurrency(value: string | number, currency: string): string {
  const num = typeof value === "string" ? parseFloat(value) : value
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M ${currency}`
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K ${currency}`
  return `${num.toFixed(0)} ${currency}`
}

function CustomTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean
  payload?: Array<{ payload: PipelineStageSummary }>
  currency: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-medium">{d.label}</p>
      <p>{d.count} opportunities</p>
      <p>{formatChartCurrency(d.totalAmount, currency)}</p>
    </div>
  )
}

interface PipelineChartProps {
  stages: PipelineStageSummary[]
  currency: string
}

export function PipelineChart({ stages, currency }: PipelineChartProps) {
  const chartData = stages.map((s) => ({
    label: s.label,
    count: s.count,
    amount: parseFloat(s.totalAmount),
    stage: s.stage,
    totalAmount: s.totalAmount,
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
                content={<CustomTooltip currency={currency} />}
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
                  formatChartCurrency(v, currency)
                }
              />
              <Tooltip
                content={<CustomTooltip currency={currency} />}
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
