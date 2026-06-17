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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricsGrid } from "@/components/dashboard/metrics-card"
import type { ReportData } from "@/lib/data/reports"

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

function fmt(v: unknown) {
  const n = typeof v === "number" ? v : Number(v ?? 0)
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(n)
}

const tooltipStyle: React.CSSProperties = {
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-80 items-center justify-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function chartOrEmpty<T>(
  data: T[],
  emptyMessage: string,
  render: (data: T[]) => React.ReactNode,
) {
  if (data.length === 0) {
    return <EmptyChart message={emptyMessage} />
  }
  return render(data)
}

export function ReportsView({ data }: { data: ReportData }) {
  const pipelineData = data.pipelineByStage.map((s) => ({
    name: s.label,
    amount: s.amount,
    fill: COLORS[s.stage] ?? "#6b7280",
  }))

  const wonLostData = data.wonLostRevenue.map((s) => ({
    name: s.type.charAt(0).toUpperCase() + s.type.slice(1),
    value: s.amount,
    color:
      s.type === "won" ? COLORS.won : s.type === "lost" ? COLORS.lost : COLORS.open,
  }))

  const trendData = data.monthlyTrends.map((s) => ({
    month: s.month,
    Created: s.created,
    Won: s.won,
  }))

  const accountData = data.topAccounts.map((s) => ({
    name: s.name.length > 20 ? s.name.slice(0, 20) + "..." : s.name,
    amount: s.amount,
  }))

  const hasRevenue = wonLostData.some((d) => d.value > 0)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pipeline, revenue, and activity metrics.
        </p>
      </div>

      <MetricsGrid
        metrics={[
          {
            label: "Total Pipeline",
            value: fmt(data.totalPipeline),
            change: 0,
            trend: "neutral" as const,
          },
          {
            label: "Closed Won",
            value: fmt(data.totalWon),
            change: 0,
            trend: "neutral" as const,
          },
          {
            label: "Win Rate",
            value: `${data.winRate}%`,
            change: 0,
            trend: "neutral" as const,
          },
          {
            label: "Avg Deal Size",
            value: fmt(data.avgDealSize),
            change: 0,
            trend: "neutral" as const,
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            {data.totalPipeline === 0 ? (
              <EmptyChart message="No active deals in pipeline." />
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={fmt} />
                    <Tooltip formatter={fmt} contentStyle={tooltipStyle} />
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
            {!hasRevenue ? (
              <EmptyChart message="No won or lost deals yet." />
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
                    <Tooltip formatter={fmt} contentStyle={tooltipStyle} />
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
            {chartOrEmpty(trendData, "No deal activity yet.", (data) => (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
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
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Accounts by Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {chartOrEmpty(accountData, "No accounts with deal activity.", (data) => (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      type="number"
                      className="text-xs"
                      tickFormatter={fmt}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      className="text-xs"
                      width={120}
                    />
                    <Tooltip formatter={fmt} contentStyle={tooltipStyle} />
                    <Bar dataKey="amount" radius={[0, 4, 4, 0]} fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
