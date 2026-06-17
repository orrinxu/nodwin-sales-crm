import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { DEAL_STAGES } from "@/lib/opportunity"
import type { DealStage } from "@/lib/opportunity"
import { getStageLabel } from "@/lib/data/opportunities.types"
import type { ActivityRecord, ActivityType } from "./activities"

export interface DashboardContext {
  user: AuthenticatedUser
  source: "web"
}

export interface PipelineMetrics {
  pipelineValue: number
  dealsWon: number
  dealsLost: number
  winRate: number
  avgDealSize: number
  unconvertibleCount: number
  currency: string
}

export interface PipelineStageSummary {
  stage: string
  label: string
  count: number
  amount: number
}

export interface RecentDealRecord {
  id: string
  name: string
  company: string | null
  stage: DealStage
  stageLabel: string
  amount: number
  probabilityPct: number
  closeDate: string | null
}

export function getReportingCurrency(): string {
  return "INR"
}

export async function getPipelineMetrics(ctx: DashboardContext): Promise<PipelineMetrics> {
  const supabase = await createServerClient()

  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("stage, amount, currency")

  if (error) {
    throw new Error(`Failed to load pipeline metrics: ${error.message}`)
  }

  const raw = (opportunities ?? []) as Array<{
    stage: string
    amount: number | null
    currency: string
  }>

  const reportingCurrency = getReportingCurrency()
  let pipelineValue = 0
  let dealsWon = 0
  let dealsLost = 0
  let totalAmount = 0
  let activeCount = 0
  let unconvertibleCount = 0

  for (const opp of raw) {
    const amount = opp.amount ?? 0

    if (opp.currency !== reportingCurrency) {
      unconvertibleCount++
      continue
    }

    totalAmount += amount

    if (opp.stage === "closed_won") {
      dealsWon++
    } else if (opp.stage === "closed_lost") {
      dealsLost++
    } else {
      pipelineValue += amount
      activeCount++
    }
  }

  const totalDeals = dealsWon + dealsLost
  const winRate = totalDeals > 0 ? Math.round((dealsWon / totalDeals) * 100) : 0

  const avgDealSize = dealsWon > 0 ? Math.round(totalAmount / (dealsWon + activeCount)) : 0

  return {
    pipelineValue,
    dealsWon,
    dealsLost,
    winRate,
    avgDealSize,
    unconvertibleCount,
    currency: reportingCurrency,
  }
}

export async function getPipelineSummary(ctx: DashboardContext): Promise<{
  stages: PipelineStageSummary[]
  totalCount: number
  totalAmount: number
  currency: string
}> {
  const supabase = await createServerClient()

  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("stage, amount, currency")

  if (error) {
    throw new Error(`Failed to load pipeline summary: ${error.message}`)
  }

  const raw = (opportunities ?? []) as Array<{
    stage: string
    amount: number | null
    currency: string
  }>

  const reportingCurrency = getReportingCurrency()
  const stageBuckets = new Map<string, { count: number; amount: number }>()

  for (const stage of DEAL_STAGES) {
    stageBuckets.set(stage, { count: 0, amount: 0 })
  }

  let totalAmount = 0
  let totalCount = 0

  for (const opp of raw) {
    const stage = opp.stage as DealStage
    const countInStage = stageBuckets.has(stage)
    const amount = opp.amount ?? 0

    totalCount++

    if (countInStage) {
      stageBuckets.get(stage)!.count++
    }

    if (opp.currency === reportingCurrency) {
      totalAmount += amount
      if (countInStage) {
        stageBuckets.get(stage)!.amount += amount
      }
    }
  }

  const stages: PipelineStageSummary[] = DEAL_STAGES.map((stage) => ({
    stage,
    label: getStageLabel(stage),
    count: stageBuckets.get(stage)?.count ?? 0,
    amount: stageBuckets.get(stage)?.amount ?? 0,
  }))

  return { stages, totalCount, totalAmount, currency: reportingCurrency }
}

export async function getRecentDeals(
  ctx: DashboardContext,
  limit = 5,
): Promise<RecentDealRecord[]> {
  const supabase = await createServerClient()

  const { data: rawDeals, error } = await supabase
    .from("opportunities")
    .select(`
      id,
      name,
      amount,
      stage,
      probability_pct,
      close_date,
      account:account_id ( name )
    `)
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to load recent deals: ${error.message}`)
  }

  const reportingCurrency = getReportingCurrency()

  return ((rawDeals ?? []) as Array<Record<string, unknown>>).map((d) => {
    const account = d.account as { name: string } | null
    const stage = (d.stage as DealStage) ?? "qualify"
    return {
      id: d.id as string,
      name: d.name as string,
      company: account?.name ?? null,
      stage,
      stageLabel: getStageLabel(stage),
      amount: Number(d.amount ?? 0),
      probabilityPct: Number(d.probability_pct ?? 0),
      closeDate: (d.close_date as string) ?? null,
    }
  })
}

const ACTIVITY_SELECT = `
  id,
  account_id,
  opportunity_id,
  user_id,
  type,
  external_thread_id,
  subject,
  body,
  metadata,
  created_at,
  updated_at,
  author:user_id ( full_name ),
  opportunity:opportunity_id ( name ),
  account:account_id ( name )
`

function toDomainActivity(data: Record<string, unknown>): ActivityRecord {
  const author = data.author as { full_name: string } | null
  const opportunity = data.opportunity as { name: string } | null
  const account = data.account as { name: string } | null
  return {
    id: data.id as string,
    opportunityId: (data.opportunity_id as string) ?? null,
    opportunityName: opportunity?.name ?? null,
    accountId: (data.account_id as string) ?? null,
    accountName: account?.name ?? null,
    userId: data.user_id as string,
    userName: author?.full_name ?? null,
    type: data.type as ActivityType,
    externalThreadId: (data.external_thread_id as string) ?? null,
    subject: (data.subject as string) ?? null,
    body: (data.body as string) ?? null,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export interface RevenueBreakdown {
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

export async function getRevenueBreakdown(ctx: DashboardContext): Promise<RevenueBreakdown[]> {
  const supabase = await createServerClient()

  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("stage, amount, currency")

  if (error) {
    throw new Error(`Failed to load revenue breakdown: ${error.message}`)
  }

  const reportingCurrency = getReportingCurrency()

  let wonAmount = 0
  let wonCount = 0
  let lostAmount = 0
  let lostCount = 0
  let openAmount = 0
  let openCount = 0

  for (const opp of (opportunities ?? []) as Array<{ stage: string; amount: number | null; currency: string }>) {
    if (opp.currency !== reportingCurrency) continue

    const amount = opp.amount ?? 0

    if (opp.stage === "closed_won") {
      wonAmount += amount
      wonCount++
    } else if (opp.stage === "closed_lost") {
      lostAmount += amount
      lostCount++
    } else {
      openAmount += amount
      openCount++
    }
  }

  return [
    { type: "won", amount: wonAmount, count: wonCount },
    { type: "lost", amount: lostAmount, count: lostCount },
    { type: "open", amount: openAmount, count: openCount },
  ]
}

export async function getMonthlyTrends(ctx: DashboardContext): Promise<MonthlyTrend[]> {
  const supabase = await createServerClient()

  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("stage, amount, currency, created_at")

  if (error) {
    throw new Error(`Failed to load monthly trends: ${error.message}`)
  }

  const reportingCurrency = getReportingCurrency()
  const monthlyMap: Record<string, { created: number; won: number; amount: number }> = {}

  for (const opp of (opportunities ?? []) as Array<{ stage: string; amount: number | null; currency: string; created_at: string | null }>) {
    if (opp.currency !== reportingCurrency) continue

    const month = (opp.created_at ?? "").slice(0, 7)
    if (!month) continue

    if (!monthlyMap[month]) {
      monthlyMap[month] = { created: 0, won: 0, amount: 0 }
    }

    const amount = opp.amount ?? 0
    monthlyMap[month].created++

    if (opp.stage === "closed_won") {
      monthlyMap[month].won++
      monthlyMap[month].amount += amount
    }
  }

  return Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      created: data.created,
      won: data.won,
      amount: data.amount,
    }))
}

export async function getTopAccounts(
  ctx: DashboardContext,
  limit = 10,
): Promise<TopAccount[]> {
  const supabase = await createServerClient()

  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select(`
      amount,
      currency,
      account:account_id ( name )
    `)

  if (error) {
    throw new Error(`Failed to load top accounts: ${error.message}`)
  }

  const reportingCurrency = getReportingCurrency()
  const accountMap: Record<string, { name: string; amount: number; count: number }> = {}

  for (const opp of (opportunities ?? []) as Array<{ amount: number | null; currency: string; account: Array<{ name: string }> | null }>) {
    if (opp.currency !== reportingCurrency) continue

    const amount = opp.amount ?? 0
    const accountName = (Array.isArray(opp.account) && opp.account.length > 0 ? opp.account[0].name : null) ?? "Unknown"

    if (!accountMap[accountName]) {
      accountMap[accountName] = { name: accountName, amount: 0, count: 0 }
    }
    accountMap[accountName].amount += amount
    accountMap[accountName].count++
  }

  return Object.values(accountMap)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
}

export async function getRecentActivities(
  ctx: DashboardContext,
  limit = 10,
): Promise<ActivityRecord[]> {
  const supabase = await createServerClient()

  const { data: rawActivities, error } = await supabase
    .from("activities")
    .select(ACTIVITY_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to load recent activities: ${error.message}`)
  }

  return (rawActivities ?? []).map((r) =>
    toDomainActivity(r as Record<string, unknown>),
  )
}
