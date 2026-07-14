"use client"

import { useCallback, useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { chartTooltipStyle, CHART_SERIES } from "@/components/primitives/chart-theme"
import type { AiUsageOverview, AiUsageDimension } from "@/lib/data/ai-usage"

// Local copy of the supported windows — the source module is "server-only", so a
// client component can only import its types, not its runtime values.
const WINDOWS = [7, 30, 90] as const

interface Props {
  initial: AiUsageOverview
  loadAction: (days: number) => Promise<AiUsageOverview>
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0, notation: "compact" })
const num = new Intl.NumberFormat("en-US")

export function AiUsageDashboard({ initial, loadAction }: Props) {
  const [data, setData] = useState(initial)
  const [pending, setPending] = useState(false)

  const setWindow = useCallback(
    async (days: number) => {
      setPending(true)
      try {
        setData(await loadAction(days))
      } finally {
        setPending(false)
      }
    },
    [loadAction],
  )

  const totalTokens = data.totals.promptTokens + data.totals.completionTokens

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-5 text-muted-foreground" /> AI usage &amp; cost
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Company-wide AI spend from the usage log. Last {data.windowDays} days ({data.from} → {data.to}).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <div className="flex rounded-md border p-0.5">
            {WINDOWS.map((w) => (
              <Button
                key={w}
                variant={data.windowDays === w ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-3"
                disabled={pending}
                onClick={() => setWindow(w)}
              >
                {w}d
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Total cost" value={usd.format(data.totals.cost)} />
        <Kpi label="AI calls" value={num.format(data.totals.calls)} />
        <Kpi label="Tokens" value={num.format(totalTokens)} sub={`${num.format(data.totals.promptTokens)} in · ${num.format(data.totals.completionTokens)} out`} />
      </div>

      {/* Cost over time */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Cost over time</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            {data.daily.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No AI usage recorded in this window.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => usdCompact.format(v)} width={56} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => usd.format(Number(v))} labelClassName="font-medium" />
                  <Area type="monotone" dataKey="cost" stroke={CHART_SERIES.created} fill={CHART_SERIES.created} fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownCard title="By provider" rows={data.byProvider} />
        <BreakdownCard title="By feature" rows={data.byFeature} />
      </div>
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function BreakdownCard({ title, rows }: { title: string; rows: AiUsageDimension[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No usage in this window.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0">
                  <td className="py-1.5 font-medium">{r.key}</td>
                  <td className="py-1.5 text-right tabular-nums">{usd.format(r.cost)}</td>
                  <td className="py-1.5 pl-4 text-right text-xs tabular-nums text-muted-foreground">{num.format(r.calls)} calls</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
