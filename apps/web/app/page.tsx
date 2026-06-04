import { requireUser } from "@/lib/security/auth"
import { getDashboardMetrics } from "@/lib/data/dashboard"
import { MetricsGrid } from "@/components/dashboard/metrics-card"
import { PipelineSummary } from "@/components/dashboard/pipeline-summary"
import { ActivityTimeline } from "@/components/dashboard/activity-timeline"
import { RecentDeals } from "@/components/dashboard/recent-deals"

export default async function DashboardPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const { metrics, pipelineSummary, recentDeals, recentActivities } =
    await getDashboardMetrics(ctx)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, {user.email?.split("@")[0] ?? "User"}. Here&apos;s
          your sales overview.
        </p>
      </div>

      <MetricsGrid metrics={metrics} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PipelineSummary stages={pipelineSummary} />
        </div>
        <div className="lg:col-span-1">
          <ActivityTimeline
            activities={recentActivities.map((a) => ({
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
        deals={recentDeals.map((d) => ({
          id: d.id,
          name: d.name,
          company: d.company,
          stage: d.stage,
          stageLabel: d.stageLabel,
          amount: d.amount,
          probabilityPct: d.probabilityPct,
          closeDate: d.closeDate,
        }))}
      />
    </div>
  )
}
