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
import type { PipelineSummary, PipelineStageSummary } from "@/lib/data/reports"
import { stageChartColor } from "@/components/primitives/chart-theme"

interface ChartDataEntry {
  label: string
  count: number
  amount: number
  stage: string
  totalAmount: string
}

function getStageColor(stage: string): string {
  return stageChartColor(stage)
}

function formatCurrency(value: string | number, currency: string): string {
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
      <p>{formatCurrency(d.totalAmount, currency)}</p>
    </div>
  )
}

interface ReportsContentProps {
  pipeline: PipelineSummary
}

export function ReportsContent({ pipeline }: ReportsContentProps) {
  const chartData: ChartDataEntry[] = pipeline.stages.map((s: PipelineStageSummary) => ({
    label: s.label,
    count: s.count,
    amount: parseFloat(s.totalAmount),
    stage: s.stage,
    totalAmount: s.totalAmount,
  }))

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Pipeline analytics and performance overview
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 text-card-foreground">
          <p className="text-sm text-muted-foreground">Total Pipeline</p>
          <p className="text-2xl font-bold">
            {formatCurrency(pipeline.totalAmount, pipeline.currency)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground">
          <p className="text-sm text-muted-foreground">Total Opportunities</p>
          <p className="text-2xl font-bold">{pipeline.totalCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground">
          <p className="text-sm text-muted-foreground">Active Stages</p>
          <p className="text-2xl font-bold">
            {pipeline.stages.filter((s: PipelineStageSummary) => s.count > 0).length}
          </p>
        </div>
      </div>

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
                  content={<CustomTooltip currency={pipeline.currency} />}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry: ChartDataEntry) => (
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
                  tickFormatter={(v: number) => formatCurrency(v, pipeline.currency)}
                />
                <Tooltip
                  content={<CustomTooltip currency={pipeline.currency} />}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry: ChartDataEntry) => (
                    <Cell key={entry.stage} fill={getStageColor(entry.stage)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Stage Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Stage</th>
                <th className="pb-2 font-medium text-right">Deals</th>
                <th className="pb-2 font-medium text-right">Total Value</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.stages.map((s: PipelineStageSummary) => (
                <tr key={s.stage} className="border-b last:border-0">
                  <td className="py-2">
                    <span
                      className="inline-block size-2 rounded-full mr-2"
                      style={{ backgroundColor: getStageColor(s.stage) }}
                    />
                    {s.label}
                  </td>
                  <td className="py-2 text-right">{s.count}</td>
                  <td className="py-2 text-right">
                    {formatCurrency(s.totalAmount, s.currency)}
                  </td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2">Total</td>
                <td className="py-2 text-right">{pipeline.totalCount}</td>
                <td className="py-2 text-right">
                  {formatCurrency(pipeline.totalAmount, pipeline.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
