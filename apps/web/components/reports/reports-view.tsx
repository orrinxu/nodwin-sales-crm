"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts"
import { AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  PipelineMetrics,
  PipelineStageSummary,
  RevenueBreakdown,
  MonthlyTrend,
  TopAccount,
} from "@/lib/data/metrics"

const COLORS: Record<string, string> = {
  qualify: "#3b82f6",
  meet_and_present: "#8b5cf6",
  propose: "#f59e0b",
  negotiate: "#ef4444",
  verbal_agreement: "#10b981",
  won: "#22c55e",
  lost: "#ef4444",
  open: "#6b7280",
}

const TERMINAL_STAGES = new Set(["closed_won", "closed_lost"])

function fmt(value: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(value)
}

const tooltipStyle: React.CSSProperties = {
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
}

interface ReportsViewProps {
  metrics: PipelineMetrics
  pipelineStages: PipelineStageSummary[]
  revenueBreakdown: RevenueBreakdown[]
  monthlyTrends: MonthlyTrend[]
  topAccounts: TopAccount[]
}

export function ReportsView({
  metrics,
  pipelineStages,
  revenueBreakdown,
  monthlyTrends,
  topAccounts,
}: ReportsViewProps) {
  const currency = metrics.currency

  const pipelineData = pipelineStages
    .filter((s) => !TERMINAL_STAGES.has(s.stage))
    .map((s) => ({
      name: s.label,
      amount: s.amount,
      fill: COLORS[s.stage] ?? "#6b7280",
    }))

  const wonLostData = revenueBreakdown.map((r) => ({
    name: r.type.charAt(0).toUpperCase() + r.type.slice(1),
    value: r.amount,
    color:
      r.type === "won"
        ? COLORS.won
        : r.type === "lost"
          ? COLORS.lost
          : COLORS.open,
  }))

  const trendData = monthlyTrends.map((m) => ({
    month: m.month,
    Created: m.created,
    Won: m.won,
  }))

  const accountData = topAccounts.map((a) => ({
    name: a.name.length > 20 ? a.name.slice(0, 20) + "..." : a.name,
    amount: a.amount,
  }))

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pipeline, revenue, and activity metrics.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pipeline Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fmt(metrics.pipelineValue, currency)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Deals Won
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.dealsWon}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.winRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Deal Size
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fmt(metrics.avgDealSize, currency)}
            </div>
          </CardContent>
        </Card>
        {metrics.unconvertibleCount > 0 && (
          <Card className="border-amber-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-amber-600">
                <AlertTriangle className="size-4" />
                Non-{currency} Deals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {metrics.unconvertibleCount}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Excluded from pipeline totals
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineData.length === 0 ? (
              <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                No pipeline data available.
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis
                      className="text-xs"
                      tickFormatter={(v: number) => fmt(v, currency)}
                    />
                    <Tooltip
                      formatter={(v) => [fmt(Number(v ?? 0), currency), ""]}
                      contentStyle={tooltipStyle}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {pipelineData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {wonLostData.every((d) => d.value === 0) ? (
              <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                No revenue data available.
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={wonLostData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name }) => name}
                    >
                      {wonLostData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => [fmt(Number(v ?? 0), currency), ""]}
                      contentStyle={tooltipStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deal Trends</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                No trend data available.
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="Created"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="Won"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Accounts by Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {accountData.length === 0 ? (
              <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                No account data available.
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={accountData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      type="number"
                      className="text-xs"
                      tickFormatter={(v: number) => fmt(v, currency)}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      className="text-xs"
                      width={120}
                    />
                    <Tooltip
                      formatter={(v) => [fmt(Number(v ?? 0), currency), ""]}
                      contentStyle={tooltipStyle}
                    />
                    <Bar dataKey="amount" radius={[0, 4, 4, 0]} fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
