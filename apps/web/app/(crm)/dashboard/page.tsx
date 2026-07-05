import { requireUser } from "@/lib/security/auth"
import {
  getPipelineMetrics,
  getPipelineSummary,
  getRecentDeals,
  getRecentActivities,
} from "@/lib/data/metrics"
import type { PipelineMetrics, PipelineStageSummary } from "@/lib/data/metrics"
import { getStuckDeals } from "@/lib/data/stuck-deals"
import { MetricsCards } from "@/components/dashboard/metrics-cards"
import { PipelineChart } from "@/components/dashboard/pipeline-chart"
import { ActivityTimeline } from "@/components/dashboard/activity-timeline"
import { RecentDeals } from "@/components/dashboard/recent-deals"
import { StuckDeals } from "@/components/dashboard/stuck-deals"

export default async function DashboardPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const [pipelineMetrics, pipelineSummary, deals, activities, stuck] = await Promise.all([
    getPipelineMetrics(ctx),
    getPipelineSummary(ctx),
    getRecentDeals(ctx),
    getRecentActivities(ctx),
    getStuckDeals(ctx),
  ])

  // Use the same resolved currency the metrics were converted into, so the
  // pipeline chart and recent-deal amounts match the metric cards.
  const currency = pipelineMetrics.currency
  const fmt = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  })

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Sales overview, pipeline health, and recent activity
        </p>
      </div>

      <MetricsCards metrics={pipelineMetrics} />

      <StuckDeals
        totalAtRisk={fmt.format(stuck.totalValueAtRisk)}
        unconvertibleCount={stuck.unconvertibleCount}
        deals={stuck.deals.map((d) => ({
          id: d.id,
          name: d.name,
          company: d.company,
          stageLabel: d.stageLabel,
          amount: fmt.format(d.amount),
          daysSinceLastActivity: d.daysSinceLastActivity,
          thresholdDays: d.thresholdDays,
          hasActivity: d.hasActivity,
          reasons: d.reasons,
          closeDate: d.closeDate,
        }))}
      />

      <PipelineChart stages={pipelineSummary.stages} currency={currency} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityTimeline activities={activities.map((a) => ({
          id: a.id,
          type: a.type,
          subject: a.subject,
          body: a.body,
          userName: a.userName,
          createdAt: a.createdAt,
          opportunityName: a.opportunityName,
        }))} />
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
    </div>
  )
}
