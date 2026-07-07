import { requireUser } from "@/lib/security/auth"
import {
  getPipelineMetrics,
  getPipelineSummary,
  getRecentDeals,
  getRecentActivities,
} from "@/lib/data/metrics"
import { getStuckDeals } from "@/lib/data/stuck-deals"
import { getNeedsAttention } from "@/lib/data/needs-attention"
import { getForecastData } from "@/lib/data/forecast"
import { getConversionFunnel } from "@/lib/data/conversion"
import { getNumberFormat, getDateFormat } from "@/lib/data/user-preferences"
import { numberFormatLocale } from "@/lib/format"
import { SummaryStrip } from "@/components/dashboard/summary-strip"
import { selectSummaryStrip } from "@/components/dashboard/summary-strip-data"
import { PipelineChart } from "@/components/dashboard/pipeline-chart"
import { ActivityTimeline } from "@/components/dashboard/activity-timeline"
import { RecentDeals } from "@/components/dashboard/recent-deals"
import { StuckDeals } from "@/components/dashboard/stuck-deals"
import { NeedsAttention } from "@/components/dashboard/needs-attention"
import { ForecastTile } from "@/components/dashboard/forecast-tile"
import { selectForecastTile } from "@/components/dashboard/forecast-tile-data"
import { ConversionFunnel } from "@/components/dashboard/conversion-funnel"
import { RepLeaderboard } from "@/components/dashboard/rep-leaderboard"
import { getDashboardLayout } from "@/lib/data/dashboard-layout"
import { DashboardGrid } from "@/components/dashboard/dashboard-grid"
import { DASHBOARD_WIDGETS, mergeLayout } from "@/components/dashboard/dashboard-widgets"
import { saveDashboardLayoutAction, resetDashboardLayoutAction } from "./actions"

export default async function DashboardPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const [pipelineMetrics, pipelineSummary, deals, activities, stuck, needsAttention, forecast, conversionFunnel, savedLayout, numberFormat, dateFormat] = await Promise.all([
    getPipelineMetrics(ctx),
    getPipelineSummary(ctx),
    getRecentDeals(ctx),
    getRecentActivities(ctx),
    getStuckDeals(ctx),
    getNeedsAttention(ctx),
    getForecastData(ctx),
    getConversionFunnel(),
    getDashboardLayout(ctx),
    getNumberFormat(ctx),
    getDateFormat(ctx),
  ])

  // Use the same resolved currency the metrics were converted into, so the
  // pipeline chart and recent-deal amounts match the metric cards. Digit grouping
  // (thousands vs lakh/crore) follows the user's number-format preference.
  const currency = pipelineMetrics.currency
  const forecastTile = selectForecastTile(forecast)
  const locale = numberFormatLocale(numberFormat)
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  })

  // Each dashboard widget, keyed by its catalogue id (see DASHBOARD_WIDGETS).
  // The server renders the nodes; DashboardGrid arranges them on a draggable,
  // resizable 12-column grid whose layout persists per user.
  const widgets = [
    {
      id: "needs-attention",
      node: (
        <NeedsAttention
          stale={needsAttention.stale}
          overdue={needsAttention.overdue}
          approvals={needsAttention.approvals}
          total={needsAttention.total}
        />
      ),
    },
    {
      id: "summary-strip",
      node: <SummaryStrip data={selectSummaryStrip(pipelineMetrics, forecastTile)} locale={locale} />,
    },
    {
      id: "forecast",
      node: <ForecastTile data={forecastTile} locale={locale} />,
    },
    {
      id: "leaderboard",
      node: (
        <RepLeaderboard
          scorecard={forecast.scorecard}
          currentUserId={user.id}
          currency={forecast.currency}
          locale={locale}
        />
      ),
    },
    {
      id: "conversion-funnel",
      node: <ConversionFunnel data={conversionFunnel} locale={locale} />,
    },
    {
      id: "stuck-deals",
      node: (
        <StuckDeals
          totalAtRisk={fmt.format(stuck.totalValueAtRisk)}
          unconvertibleCount={stuck.unconvertibleCount}
          dateFormat={dateFormat}
          deals={stuck.deals.map((d) => ({
            id: d.id,
            name: d.name,
            company: d.company,
            stage: d.stage,
            stageLabel: d.stageLabel,
            amount: fmt.format(d.amount),
            daysSinceLastActivity: d.daysSinceLastActivity,
            thresholdDays: d.thresholdDays,
            hasActivity: d.hasActivity,
            reasons: d.reasons,
            closeDate: d.closeDate,
          }))}
        />
      ),
    },
    {
      id: "pipeline-chart",
      node: <PipelineChart stages={pipelineSummary.stages} currency={currency} locale={locale} />,
    },
    {
      id: "activity",
      node: (
        <ActivityTimeline
          dateFormat={dateFormat}
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
      ),
    },
    {
      id: "recent-deals",
      node: (
        <RecentDeals
          dateFormat={dateFormat}
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
      ),
    },
  ]

  const layout = mergeLayout(savedLayout, DASHBOARD_WIDGETS)

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Sales overview, pipeline health, and recent activity
        </p>
      </div>

      <DashboardGrid
        widgets={widgets}
        initialLayout={layout}
        saveAction={saveDashboardLayoutAction}
        resetAction={resetDashboardLayoutAction}
      />
    </div>
  )
}
