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
import { getNumberFormat } from "@/lib/data/user-preferences"
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
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs"
import { DashboardSection } from "@/components/dashboard/dashboard-section"
import { Card, CardContent } from "@/components/ui/card"

export default async function DashboardPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const [pipelineMetrics, pipelineSummary, deals, activities, stuck, needsAttention, forecast, conversionFunnel, numberFormat] = await Promise.all([
    getPipelineMetrics(ctx),
    getPipelineSummary(ctx),
    getRecentDeals(ctx),
    getRecentActivities(ctx),
    getStuckDeals(ctx),
    getNeedsAttention(ctx),
    getForecastData(ctx),
    getConversionFunnel(),
    getNumberFormat(ctx),
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

  // ── "My focus" — the single-rep hub, action-first (SOW §17 per-user tier) ──
  const myFocus = (
    <div className="space-y-6">
      <DashboardSection label="Needs your attention">
        <NeedsAttention
          stale={needsAttention.stale}
          overdue={needsAttention.overdue}
          approvals={needsAttention.approvals}
          total={needsAttention.total}
        />
      </DashboardSection>

      <DashboardSection label="My numbers">
        <div className="space-y-4">
          <SummaryStrip data={selectSummaryStrip(pipelineMetrics, forecastTile)} locale={locale} />
          <ForecastTile data={forecastTile} locale={locale} />
        </div>
      </DashboardSection>

      <DashboardSection label="My pipeline">
        <div className="grid gap-4 lg:grid-cols-2">
          <PipelineChart stages={pipelineSummary.stages} currency={currency} locale={locale} />
          <StuckDeals
            totalAtRisk={fmt.format(stuck.totalValueAtRisk)}
            unconvertibleCount={stuck.unconvertibleCount}
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
        </div>
      </DashboardSection>

      <DashboardSection label="Recent">
        <div className="grid gap-4 lg:grid-cols-2">
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
      </DashboardSection>
    </div>
  )

  // ── "Team" — cross-rep performance (leaderboard + conversion funnel move here
  //    from the rep homepage; SOW §17 per-team tier). Deeper team aggregation is
  //    a follow-up ticket. ──
  const team = (
    <DashboardSection label="Team">
      <div className="grid gap-4 lg:grid-cols-2">
        <RepLeaderboard
          scorecard={forecast.scorecard}
          currentUserId={user.id}
          currency={forecast.currency}
          locale={locale}
        />
        <ConversionFunnel data={conversionFunnel} locale={locale} />
      </div>
    </DashboardSection>
  )

  // ── "Group" — management rollups (SOW §17 per-management tier). Shell for now;
  //    population is built on the region engine in a follow-up ticket. ──
  const group = (
    <DashboardSection label="Group">
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Group-wide rollups are coming soon — built on the new region engine,
          for execs and regional leads.
        </CardContent>
      </Card>
    </DashboardSection>
  )

  return (
    <div className="p-6">
      <DashboardTabs myFocus={myFocus} team={team} group={group} />
    </div>
  )
}
