import { requireUser } from "@/lib/security/auth"
import {
  getPipelineMetrics,
  getPipelineSummary,
  getRecentDeals,
  getRecentActivities,
} from "@/lib/data/metrics"
import { getStuckDeals } from "@/lib/data/stuck-deals"
import { getNeedsAttention } from "@/lib/data/needs-attention"
import { getMyTasks } from "@/lib/data/tasks"
import { getMyTargetProgress } from "@/lib/data/sales-targets"
import { getForecastData, getTeamScorecard, getGroupScorecard } from "@/lib/data/forecast"
import { getConversionFunnel } from "@/lib/data/conversion"
import { getTeamScope } from "@/lib/data/team"
import { getGroupScope } from "@/lib/data/group"
import { getNumberFormat } from "@/lib/data/user-preferences"
import { numberFormatLocale } from "@/lib/format"
import { SummaryStrip } from "@/components/dashboard/summary-strip"
import { selectSummaryStrip } from "@/components/dashboard/summary-strip-data"
import { PipelineChartLazy } from "@/components/dashboard/pipeline-chart.lazy"
import { ActivityTimeline } from "@/components/dashboard/activity-timeline"
import { RecentDeals } from "@/components/dashboard/recent-deals"
import { StuckDeals } from "@/components/dashboard/stuck-deals"
import { NeedsAttention } from "@/components/dashboard/needs-attention"
import { MyTasks } from "@/components/dashboard/my-tasks"
import { TargetProgressCard } from "@/components/dashboard/target-progress"
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

  // Group tab (ORR-723): role gate is a pure function of the caller's role, so
  // resolve it up front and only fetch the (bounded) group aggregates when the
  // caller's role can actually see a Group rollup.
  const groupScope = getGroupScope(ctx)

  const [pipelineMetrics, pipelineSummary, deals, activities, stuck, needsAttention, myTasks, targetProgress, forecast, teamScope, groupScorecard, groupConversionFunnel, numberFormat] = await Promise.all([
    getPipelineMetrics(ctx),
    getPipelineSummary(ctx),
    getRecentDeals(ctx),
    getRecentActivities(ctx),
    getStuckDeals(ctx),
    getNeedsAttention(ctx),
    getMyTasks(ctx),
    getMyTargetProgress(ctx),
    getForecastData(ctx),
    getTeamScope(ctx),
    // Group tab (ORR-723): region/group rollup. Only fetch for leadership roles;
    // non-leadership callers get an empty resolver set anyway, but skip the RPCs.
    groupScope.canViewGroup ? getGroupScorecard(ctx) : Promise.resolve(null),
    groupScope.canViewGroup ? getConversionFunnel(ctx, { groupOnly: true }) : Promise.resolve(null),
    getNumberFormat(ctx),
  ])

  // Team tab (ORR-722 / ORR-768): the leaderboard + funnel only ever render when
  // the caller manages a team, so skip both aggregate RPCs entirely otherwise —
  // a non-manager's dashboard no longer runs them on every load. `teamScope`
  // resolves in the parallel wave above, so this adds a round-trip only for the
  // managers who actually need the data (and pay nothing for the common case).
  const [teamScorecard, teamConversionFunnel] = teamScope.hasReports
    ? await Promise.all([
        getTeamScorecard(ctx),
        getConversionFunnel(ctx, { teamOnly: true }),
      ])
    : [null, null]

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
  // Recent deals carry their own currency (reporting currency when convertible,
  // otherwise the deal's own), so format each in the currency it's actually in.
  const formatMoney = (amount: number, cur: string) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(amount)

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

      <DashboardSection label="My tasks">
        <MyTasks
          tasks={myTasks.map((t) => ({
            id: t.id,
            title: t.title,
            dueDate: t.dueDate,
            priority: t.priority,
            opportunityId: t.opportunityId,
            opportunityName: t.opportunityName,
            accountName: t.accountName,
            contactName: t.contactName,
          }))}
        />
      </DashboardSection>

      <DashboardSection label="My numbers">
        <div className="space-y-4">
          <SummaryStrip data={selectSummaryStrip(pipelineMetrics, forecastTile)} locale={locale} />
          <TargetProgressCard progress={targetProgress} locale={locale} />
          <ForecastTile data={forecastTile} locale={locale} />
        </div>
      </DashboardSection>

      <DashboardSection label="My pipeline">
        <div className="grid gap-4 lg:grid-cols-2">
          <PipelineChartLazy stages={pipelineSummary.stages} currency={currency} locale={locale} />
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
              // Meeting detail (ORR-828): thread the calendar fields + metadata
              // through so meeting rows can show their time/location/attendees.
              startsAt: a.startsAt,
              endsAt: a.endsAt,
              timeZone: a.timeZone,
              allDay: a.allDay,
              metadata: a.metadata,
            }))}
          />
          <RecentDeals
            deals={deals.map((d) => ({
              id: d.id,
              name: d.name,
              company: d.company,
              stage: d.stage,
              stageLabel: d.stageLabel,
              amount: formatMoney(d.amount, d.currency),
              probabilityPct: d.probabilityPct,
              closeDate: d.closeDate,
            }))}
          />
        </div>
      </DashboardSection>
    </div>
  )

  // ── "Team" — cross-rep performance scoped to the caller's reporting line
  //    (ORR-722; ratified D3 = manager chain). Leaderboard + conversion funnel
  //    aggregate the caller's subtree (self + recursive reports), a narrowing on
  //    top of RLS. A caller with no reports gets an empty state rather than a
  //    one-row leaderboard of themselves. ──
  const team = (
    <DashboardSection label="Team">
      {teamScorecard && teamConversionFunnel ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <RepLeaderboard
            scorecard={teamScorecard.scorecard}
            currentUserId={user.id}
            currency={teamScorecard.currency}
            locale={locale}
          />
          <ConversionFunnel data={teamConversionFunnel} locale={locale} />
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            You don&apos;t manage a team yet. When people report to you, their
            leaderboard and conversion funnel show up here.
          </CardContent>
        </Card>
      )}
    </DashboardSection>
  )

  // ── "Group" — management rollups (SOW §17 per-management tier; ORR-723). Built
  //    on the ORR-714 region engine: exec/group_sales_lead roll up the whole group,
  //    a regional_head their region (via region_entity_ids on entity_sales_id), a
  //    narrowing on top of RLS. Non-leadership roles get a locked empty state. ──
  const group = (
    <DashboardSection label="Group">
      {groupScope.canViewGroup && groupScorecard && groupConversionFunnel ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <RepLeaderboard
            scorecard={groupScorecard.scorecard}
            currentUserId={user.id}
            currency={groupScorecard.currency}
            locale={locale}
            scopeLabel="Group"
          />
          <ConversionFunnel data={groupConversionFunnel} locale={locale} />
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Group-wide rollups are available to executive and regional leadership.
            They aggregate deals across your {groupScope.tier === "region" ? "region" : "group"}.
          </CardContent>
        </Card>
      )}
    </DashboardSection>
  )

  return (
    <div className="p-6">
      <DashboardTabs myFocus={myFocus} team={team} group={group} />
    </div>
  )
}
