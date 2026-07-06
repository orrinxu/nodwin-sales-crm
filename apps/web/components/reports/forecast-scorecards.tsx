"use client"

import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
} from "recharts"
import { TrendingUp, CircleDollarSign, CalendarClock, Wallet } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/components/primitives/kpi-card"
import { SectionHeader } from "@/components/primitives/section-header"
import { EmptyState } from "@/components/primitives/empty-state"
import { DataTable } from "@/components/primitives/data-table"
import {
  CHART_SERIES,
  chartTooltipStyle,
  stageChartColor,
} from "@/components/primitives/chart-theme"
import type { ForecastData, RepScorecardRow } from "@/lib/data/forecast"

function useMoneyFmt(currency: string) {
  return useMemo(() => {
    const compact = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    })
    const full = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    })
    return {
      compact: (v: number) => compact.format(v),
      full: (v: number) => full.format(v),
    }
  }, [currency])
}

export function ForecastScorecards({ data }: { data: ForecastData }) {
  const money = useMoneyFmt(data.currency)

  const stageData = data.stageBreakdown.map((s) => ({
    name: s.label,
    weighted: s.weighted,
    fill: stageChartColor(s.stage),
  }))

  const curveData = data.revenueCurve.map((p) => ({
    month: p.month,
    amount: p.amount,
  }))

  const columns: ColumnDef<RepScorecardRow>[] = useMemo(
    () => [
      {
        accessorKey: "ownerName",
        header: "Rep",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.ownerName}</span>
        ),
      },
      {
        accessorKey: "openPipeline",
        header: () => <div className="text-right">Open pipeline</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {money.full(row.original.openPipeline)}
          </div>
        ),
      },
      {
        accessorKey: "weightedPipeline",
        header: () => <div className="text-right">Weighted</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {money.full(row.original.weightedPipeline)}
          </div>
        ),
      },
      {
        accessorKey: "won",
        header: () => <div className="text-right">Won (qtr)</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {money.full(row.original.won)}
          </div>
        ),
      },
      {
        accessorKey: "winRate",
        header: () => <div className="text-right">Win rate</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.winRate === null ? "—" : `${row.original.winRate}%`}
          </div>
        ),
      },
      {
        accessorKey: "avgSalesCycleDays",
        header: () => <div className="text-right">Avg cycle</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.avgSalesCycleDays === null
              ? "—"
              : `${row.original.avgSalesCycleDays}d`}
          </div>
        ),
      },
    ],
    [money],
  )

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Forecast & Scorecards"
        description={`Weighted pipeline, committed revenue, and rep performance — in ${data.currency}.`}
      />

      {data.unconvertibleCount > 0 ? (
        <p className="text-caption text-muted-foreground">
          {data.unconvertibleCount} currency subtotal
          {data.unconvertibleCount === 1 ? "" : "s"} excluded — no FX rate to{" "}
          {data.currency}.
        </p>
      ) : null}

      {/* Headline forecast tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Weighted forecast — this quarter"
          value={money.compact(data.weightedThisQuarter)}
          icon={TrendingUp}
          hint="Σ probability × amount"
        />
        <KpiCard
          label="Committed — this quarter"
          value={money.compact(data.committedThisQuarter)}
          icon={CircleDollarSign}
          hint="Closed-won this quarter"
        />
        <KpiCard
          label="Weighted forecast — next quarter"
          value={money.compact(data.weightedNextQuarter)}
          icon={CalendarClock}
        />
        <KpiCard
          label="Open pipeline (weighted)"
          value={money.compact(data.weightedPipelineTotal)}
          icon={Wallet}
          hint={`${money.compact(data.openPipelineTotal)} gross`}
        />
      </div>

      {/* Committed vs weighted, by period */}
      <Card>
        <CardHeader>
          <CardTitle>Committed vs weighted by period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 text-right font-medium">Committed (won)</th>
                  <th className="pb-2 text-right font-medium">Weighted forecast</th>
                  <th className="pb-2 text-right font-medium">Open pipeline</th>
                </tr>
              </thead>
              <tbody>
                {data.periodBreakdown.map((p) => (
                  <tr key={p.period} className="border-b last:border-0">
                    <td className="py-2">{p.label}</td>
                    <td className="py-2 text-right tabular-nums">
                      {money.full(p.committed)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {money.full(p.weighted)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {money.full(p.openPipeline)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weighted pipeline by stage */}
        <Card>
          <CardHeader>
            <CardTitle>Weighted pipeline by stage</CardTitle>
          </CardHeader>
          <CardContent>
            {stageData.length === 0 ? (
              <EmptyState
                title="No open pipeline"
                description="Weighted forecast will appear once there are open deals with a probability."
              />
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stageData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis
                      className="text-xs"
                      tickFormatter={(v: number) => money.compact(v)}
                    />
                    <Tooltip
                      formatter={(v: unknown) => money.full(Number(v ?? 0))}
                      contentStyle={chartTooltipStyle}
                    />
                    <Bar dataKey="weighted" radius={[4, 4, 0, 0]}>
                      {stageData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue curve */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue curve (scheduled)</CardTitle>
          </CardHeader>
          <CardContent>
            {curveData.length === 0 ? (
              <EmptyState
                title="No scheduled revenue"
                description="Monthly revenue splits will chart here once opportunities have a revenue schedule."
              />
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={curveData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis
                      className="text-xs"
                      tickFormatter={(v: number) => money.compact(v)}
                    />
                    <Tooltip
                      formatter={(v: unknown) => money.full(Number(v ?? 0))}
                      contentStyle={chartTooltipStyle}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke={CHART_SERIES.won}
                      fill={CHART_SERIES.won}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rep scorecard */}
      <Card>
        <CardHeader>
          <CardTitle>Rep scorecard</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={data.scorecard}
            getRowId={(r) => r.ownerId ?? "__unassigned__"}
            emptyState={
              <EmptyState
                title="No reps to score"
                description="Scorecard rows appear once opportunities are owned."
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
