import { requireUser } from "@/lib/security/auth"
import {
  getSalesMetrics,
  getDashboardPipelineSummary,
  getRecentActivities,
  getRecentDeals,
} from "@/lib/data/dashboard"
import { MetricsCards } from "@/components/dashboard/metrics-cards"
import { PipelineChart } from "@/components/dashboard/pipeline-chart"
import { ActivityTimeline } from "@/components/dashboard/activity-timeline"
import { RecentDeals } from "@/components/dashboard/recent-deals"

export default async function DashboardPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const [metrics, pipeline, activities, deals] = await Promise.all([
    getSalesMetrics(ctx),
    getDashboardPipelineSummary(ctx),
    getRecentActivities(ctx),
    getRecentDeals(ctx),
  ])

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Sales overview, pipeline health, and recent activity
        </p>
      </div>

      <MetricsCards metrics={metrics} />

      <PipelineChart stages={pipeline.stages} currency={pipeline.currency} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityTimeline activities={activities} />
        <RecentDeals deals={deals} />
      </div>
    </div>
  )
}
