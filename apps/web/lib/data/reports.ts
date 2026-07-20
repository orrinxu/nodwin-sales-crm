import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { DEAL_STAGES, isTerminalStage } from "@/lib/opportunity"
import { getStageLabel } from "@/lib/data/opportunities.types"
import {
  fetchAndConvert,
  resolveReportingCurrency,
  resolveReportTimeZone,
  type DashboardContext,
} from "@/lib/data/metrics"

export interface PipelineByStage {
  stage: string
  label: string
  count: number
  amount: number
}

export interface WonLostRevenue {
  type: "won" | "lost" | "open"
  amount: number
  count: number
}

export interface MonthlyTrend {
  month: string
  created: number
  won: number
  amount: number
}

export interface TopAccount {
  name: string
  amount: number
  count: number
}

export interface ReportData {
  pipelineByStage: PipelineByStage[]
  wonLostRevenue: WonLostRevenue[]
  monthlyTrends: MonthlyTrend[]
  topAccounts: TopAccount[]
  totalPipeline: number
  totalWon: number
  avgDealSize: number
  winRate: number
  /** Reporting currency every money figure above is expressed in (ORR-799). */
  currency: string
  /**
   * Deals dropped from the pipeline rollup because their currency has no FX rate
   * to {@link ReportData.currency} (ORR-799). Surfaced so the exclusion is never
   * silent — same convention as the dashboard summary strip / forecast section.
   */
  unconvertibleCount: number
}

export interface PipelineStageSummary {
  stage: string
  label: string
  count: number
  totalAmount: string
  currency: string
}

export interface PipelineSummary {
  stages: PipelineStageSummary[]
  totalAmount: string
  currency: string
  totalCount: number
}

/**
 * Report-page rollups (ORR-757). Previously `.limit(500)`'d the opportunities
 * table and reduced every rollup in JS — silently partial past 500 deals. Each
 * rollup now comes from a bounded GROUP BY RPC (per dimension × currency), folded
 * through fetchAndConvert at today's rate — the pipeline_metrics_agg /
 * forecast_pipeline_agg pattern. Unconvertible-currency buckets are dropped from
 * the totals (same as the prior fetchAndConvert behaviour).
 */
export async function getReportData(ctx: DashboardContext): Promise<ReportData> {
  const supabase = await createServerClient()
  const [reportingCurrency, reportTimeZone] = await Promise.all([
    resolveReportingCurrency(ctx),
    resolveReportTimeZone(ctx),
  ])

  const [stageRes, monthRes, accountRes] = await Promise.all([
    supabase.rpc("pipeline_metrics_agg"),
    // Created deals bucket by the caller's calendar month (ORR-813); won deals
    // bucket by close month inside the RPC.
    supabase.rpc("report_monthly_agg", { _tz: reportTimeZone }),
    supabase.rpc("report_top_accounts_agg"),
  ])
  if (stageRes.error) throw new Error(`Failed to load report stages: ${stageRes.error.message}`)
  if (monthRes.error) throw new Error(`Failed to load report months: ${monthRes.error.message}`)
  if (accountRes.error) throw new Error(`Failed to load report accounts: ${accountRes.error.message}`)

  // ── Pipeline by stage / won-lost / totals (per stage × currency) ────────────
  const { converted: stageConv } = await fetchAndConvert(
    (stageRes.data ?? []).map((r) => ({
      stage: r.stage,
      amount: Number(r.gross_amount) || 0,
      currency: r.currency,
      close_date: null,
      count: Number(r.deal_count) || 0,
    })),
    reportingCurrency,
  )
  const stageAmount = new Map<string, number>()
  const stageCount = new Map<string, number>()
  for (const b of stageConv) {
    stageAmount.set(b.stage, (stageAmount.get(b.stage) ?? 0) + b.amount)
    stageCount.set(b.stage, (stageCount.get(b.stage) ?? 0) + b.count)
  }

  // Deals dropped because their currency has no FX rate to the reporting
  // currency (fetchAndConvert skips those buckets). Computed as total minus
  // converted deal count over the pipeline aggregate — the same deal-based
  // semantics getPipelineMetrics surfaces — so the exclusion is shown, not
  // silently swallowed. (Count-preservation through the fold is a follow-up.)
  let totalStageDeals = 0
  for (const r of stageRes.data ?? []) totalStageDeals += Number(r.deal_count) || 0
  let convertedStageDeals = 0
  for (const c of stageCount.values()) convertedStageDeals += c
  const unconvertibleCount = Math.max(0, totalStageDeals - convertedStageDeals)

  const pipelineByStage: PipelineByStage[] = DEAL_STAGES.filter(
    (s) => !isTerminalStage(s),
  ).map((stage) => ({
    stage,
    label: getStageLabel(stage),
    count: stageCount.get(stage) ?? 0,
    amount: stageAmount.get(stage) ?? 0,
  }))

  const totalWonAmount = stageAmount.get("closed_won") ?? 0
  const totalLostAmount = stageAmount.get("closed_lost") ?? 0
  const wonCount = stageCount.get("closed_won") ?? 0
  const lostCount = stageCount.get("closed_lost") ?? 0

  let openCount = 0
  let openAmount = 0
  for (const stage of DEAL_STAGES) {
    if (isTerminalStage(stage)) continue
    openCount += stageCount.get(stage) ?? 0
    openAmount += stageAmount.get(stage) ?? 0
  }

  const wonLostRevenue: WonLostRevenue[] = [
    { type: "won", amount: totalWonAmount, count: wonCount },
    { type: "lost", amount: totalLostAmount, count: lostCount },
    { type: "open", amount: openAmount, count: openCount },
  ]

  const totalPipeline = openAmount
  const totalDeals = wonCount + lostCount
  const winRate = totalDeals > 0 ? Math.round((wonCount / totalDeals) * 100) : 0
  const avgDealSize = computeAverage(totalWonAmount, wonCount)

  // ── Monthly trends (created by created-month, won by CLOSE month; ORR-813) ──
  const { converted: monthConv } = await fetchAndConvert(
    (monthRes.data ?? []).map((r) => ({
      stage: "",
      amount: Number(r.won_amount) || 0,
      currency: r.currency,
      close_date: null,
      month: r.month,
      created: Number(r.created_count) || 0,
      won: Number(r.won_count) || 0,
    })),
    reportingCurrency,
  )
  const monthlyMap = new Map<string, { created: number; won: number; amount: number }>()
  for (const b of monthConv) {
    const m = monthlyMap.get(b.month) ?? { created: 0, won: 0, amount: 0 }
    m.created += b.created
    m.won += b.won
    m.amount += b.amount
    monthlyMap.set(b.month, m)
  }
  const monthlyTrends: MonthlyTrend[] = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({ month, created: d.created, won: d.won, amount: d.amount }))

  // ── Top accounts by revenue (per account × currency, top 50 → FX → top 10) ──
  const { converted: acctConv } = await fetchAndConvert(
    (accountRes.data ?? []).map((r) => ({
      stage: "",
      amount: Number(r.gross_amount) || 0,
      currency: r.currency,
      close_date: null,
      accountId: r.account_id,
      name: r.account_name,
      count: Number(r.deal_count) || 0,
    })),
    reportingCurrency,
  )
  const accountMap = new Map<string, { name: string; amount: number; count: number }>()
  for (const b of acctConv) {
    const a = accountMap.get(b.accountId) ?? { name: b.name, amount: 0, count: 0 }
    a.amount += b.amount
    a.count += b.count
    accountMap.set(b.accountId, a)
  }
  const topAccounts: TopAccount[] = Array.from(accountMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((a) => ({ name: a.name, amount: a.amount, count: a.count }))

  return {
    pipelineByStage,
    wonLostRevenue,
    monthlyTrends,
    topAccounts,
    totalPipeline,
    totalWon: totalWonAmount,
    avgDealSize,
    winRate,
    currency: reportingCurrency,
    unconvertibleCount,
  }
}

function computeAverage(sum: number, count: number): number {
  return count > 0 ? Math.round(sum / count) : 0
}
