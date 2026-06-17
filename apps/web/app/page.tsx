import { requireUser } from "@/lib/security/auth"
import {
  getPipelineMetrics,
  getPipelineSummary,
  getRecentDeals,
  getRecentActivities,
  getReportingCurrency,
} from "@/lib/data/metrics"
import { MetricsGrid } from "@/components/dashboard/metrics-card"
import type { SalesMetric } from "@/components/dashboard/metrics-card"
import { PipelineSummary } from "@/components/dashboard/pipeline-summary"
import { ActivityTimeline } from "@/components/dashboard/activity-timeline"
import { RecentDeals } from "@/components/dashboard/recent-deals"

export default async function DashboardPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const [pipelineMetrics, pipelineSummary, deals, activities] = await Promise.all([
    getPipelineMetrics(ctx),
    getPipelineSummary(ctx),
    getRecentDeals(ctx),
    getRecentActivities(ctx),
  ])

  const currency = getReportingCurrency()

  const fmt = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  })

  const metricCards: SalesMetric[] = [
    {
      label: "Pipeline Value",
      value: fmt.format(pipelineMetrics.pipelineValue),
      change: 12.5,
      trend: "up" as const,
    },
    {
      label: "Deals Won",
      value: pipelineMetrics.dealsWon.toString(),
      change: 8.2,
      trend: "up" as const,
    },
    {
      label: "Win Rate",
      value: `${pipelineMetrics.winRate}%`,
      change: 0,
      trend: pipelineMetrics.winRate >= 50 ? ("up" as const) : ("down" as const),
    },
    {
      label: "Avg Deal Size",
      value: fmt.format(pipelineMetrics.avgDealSize),
      change: 5.8,
      trend: "up" as const,
    },
  ]

  if (pipelineMetrics.unconvertibleCount > 0) {
    metricCards.push({
      label: "Non-INR Deals",
      value: `${pipelineMetrics.unconvertibleCount}`,
      change: 0,
      trend: "neutral" as const,
    })
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, {user.email?.split("@")[0] ?? "User"}. Here&apos;s
          your sales overview.
        </p>
      </div>

      <MetricsGrid metrics={metricCards} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PipelineSummary stages={pipelineSummary.stages.map((s) => ({
            stage: s.stage,
            label: s.label,
            count: s.count,
            value: s.amount,
          }))} />
        </div>
        <div className="lg:col-span-1">
          <ActivityTimeline
            activities={activities.map((a) => ({
              id: a.id,
              type: a.type,
              subject: a.subject,
              body: a.body,
              userName: a.userName,
              createdAt: a.createdAt,
              opportunityName: a.opportunityName,
            }))}
          />
        </div>
      </div>

      <RecentDeals
        deals={deals.map((d) => ({
          id: d.id,
          name: d.name,
          company: d.company,
          stage: d.stage,
          stageLabel: d.stageLabel,
          amount: fmt.format(d.amount),
          probabilityPct: d.probabilityPct,
          closeDate: d.closeDate,
        }))}
      />
    </div>
  )
}
