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

export async function getPipelineMetrics(_ctx: DashboardContext): Promise<PipelineMetrics> {
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

export async function getPipelineSummary(_ctx: DashboardContext): Promise<{
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
