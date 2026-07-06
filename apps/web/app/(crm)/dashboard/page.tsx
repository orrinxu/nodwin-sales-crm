import { requireUser } from "@/lib/security/auth"
import {
  getPipelineMetrics,
  getPipelineSummary,
  getRecentDeals,
  getRecentActivities,
} from "@/lib/data/metrics"
import type { PipelineMetrics, PipelineStageSummary } from "@/lib/data/metrics"
import { getStuckDeals } from "@/lib/data/stuck-deals"
import { getNeedsAttention } from "@/lib/data/needs-attention"
import { getForecastData } from "@/lib/data/forecast"
import { getNumberFormat, getDateFormat } from "@/lib/data/user-preferences"
import { numberFormatLocale } from "@/lib/format"
import { MetricsCards } from "@/components/dashboard/metrics-cards"
import { PipelineChart } from "@/components/dashboard/pipeline-chart"
import { ActivityTimeline } from "@/components/dashboard/activity-timeline"
import { RecentDeals } from "@/components/dashboard/recent-deals"
import { StuckDeals } from "@/components/dashboard/stuck-deals"
import { NeedsAttention } from "@/components/dashboard/needs-attention"
import { ForecastTile } from "@/components/dashboard/forecast-tile"
import { selectForecastTile } from "@/components/dashboard/forecast-tile-data"

export default async function DashboardPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const [pipelineMetrics, pipelineSummary, deals, activities, stuck, needsAttention, forecast, numberFormat, dateFormat] = await Promise.all([
    getPipelineMetrics(ctx),
    getPipelineSummary(ctx),
    getRecentDeals(ctx),
    getRecentActivities(ctx),
    getStuckDeals(ctx),
    getNeedsAttention(ctx),
    getForecastData(ctx),
    getNumberFormat(ctx),
    getDateFormat(ctx),
  ])

  // Use the same resolved currency the metrics were converted into, so the
  // pipeline chart and recent-deal amounts match the metric cards. Digit grouping
  // (thousands vs lakh/crore) follows the user's number-format preference.
  const currency = pipelineMetrics.currency
  const locale = numberFormatLocale(numberFormat)
  const fmt = new Intl.NumberFormat(locale, {
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

      <NeedsAttention
        stale={needsAttention.stale}
        overdue={needsAttention.overdue}
        approvals={needsAttention.approvals}
        total={needsAttention.total}
      />

      <MetricsCards metrics={pipelineMetrics} locale={locale} />

      <ForecastTile data={selectForecastTile(forecast)} locale={locale} />

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

      <PipelineChart stages={pipelineSummary.stages} currency={currency} locale={locale} />

      <div className="grid gap-6 lg:grid-cols-2">
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
      </div>
    </div>
  )
}
