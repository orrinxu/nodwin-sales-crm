import { requireUser } from "@/lib/security/auth"
import {
  getPipelineMetrics,
  getPipelineSummary,
  getRevenueBreakdown,
  getMonthlyTrends,
  getTopAccounts,
} from "@/lib/data/metrics"
import { ReportsView } from "@/components/reports/reports-view"
import type { DashboardContext } from "@/lib/data/metrics"

export const metadata = {
  title: "Reports - Nodwin CRM",
}

export default async function ReportsPage() {
  const user = await requireUser()
  const ctx: DashboardContext = { user, source: "web" }

  const [metrics, pipelineSummary, revenueBreakdown, monthlyTrends, topAccounts] =
    await Promise.all([
      getPipelineMetrics(ctx),
      getPipelineSummary(ctx),
      getRevenueBreakdown(ctx),
      getMonthlyTrends(ctx),
      getTopAccounts(ctx),
    ])

  return (
    <ReportsView
      metrics={metrics}
      pipelineStages={pipelineSummary.stages}
      revenueBreakdown={revenueBreakdown}
      monthlyTrends={monthlyTrends}
      topAccounts={topAccounts}
    />
  )
}
