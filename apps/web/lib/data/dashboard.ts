import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { Money } from "@/lib/money"
import { DEAL_STAGES, type DealStage } from "@/lib/opportunity"
import type { ActivityRecord, ActivityType } from "./activities"
import type { OpportunityRecord } from "./opportunities.types"

export interface DashboardCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface SalesMetrics {
  pipelineValue: string
  pipelineCurrency: string
  dealsWon: number
  dealsLost: number
  winRate: number
  avgDealSize: string
  avgDealCurrency: string
}

const STAGE_LABELS: Record<DealStage, string> = {
  qualify: "Qualify",
  meet_and_present: "Meet & Present",
  propose: "Propose",
  negotiate: "Negotiate",
  verbal_agreement: "Verbal Agreement",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
}

export { STAGE_LABELS }

export async function getSalesMetrics(
  _ctx: DashboardCallContext,
): Promise<SalesMetrics> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("opportunities")
    .select("stage, amount, currency")

  if (error) {
    throw new Error(`Failed to load sales metrics: ${error.message}`)
  }

    const rows = data ?? []
  const defaultCurrency = "USD"

  let pipelineCents = 0
  let wonCount = 0
  let lostCount = 0
  let dealCountWithValue = 0
  let totalActiveCents = 0

  for (const row of rows) {
    const stage = (row.stage as DealStage) ?? "qualify"
    const amountStr = row.amount != null ? String(row.amount) : "0"
    const currency = (row.currency as string) ?? defaultCurrency

    if (currency !== defaultCurrency) continue

    const money = Money.fromAmount(amountStr, currency)

    if (stage === "closed_won") {
      wonCount++
    } else if (stage === "closed_lost") {
      lostCount++
    } else {
      pipelineCents += money.cents
      dealCountWithValue++
    }

    if (stage !== "closed_lost") {
      totalActiveCents += money.cents
    }
  }

  const totalWonLost = wonCount + lostCount
  const winRate = totalWonLost > 0 ? Math.round((wonCount / totalWonLost) * 100) : 0

  const totalActiveMoney = Money.fromCents(totalActiveCents, defaultCurrency)
  const avgMoney = dealCountWithValue > 0
    ? totalActiveMoney.divide(dealCountWithValue)
    : Money.zero(defaultCurrency)

  return {
    pipelineValue: Money.fromCents(pipelineCents, defaultCurrency).toAmount(),
    pipelineCurrency: defaultCurrency,
    dealsWon: wonCount,
    dealsLost: lostCount,
    winRate,
    avgDealSize: avgMoney.toAmount(),
    avgDealCurrency: defaultCurrency,
  }
}

export interface PipelineStageSummary {
  stage: DealStage
  label: string
  count: number
  totalAmount: string
  currency: string
}

export interface PipelineSummary {
  stages: PipelineStageSummary[]
  totalCount: number
  totalAmount: string
  currency: string
}

export async function getDashboardPipelineSummary(
  _ctx: DashboardCallContext,
): Promise<PipelineSummary> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("opportunities")
    .select("stage, amount, currency")

  if (error) {
    throw new Error(`Failed to load dashboard pipeline data: ${error.message}`)
  }

  const defaultCurrency = "USD"

  const stageCounts = new Map<DealStage, number>()
  const stageAmounts = new Map<DealStage, { cents: number; currency: string }>()

  for (const stage of DEAL_STAGES) {
    stageCounts.set(stage, 0)
    stageAmounts.set(stage, { cents: 0, currency: defaultCurrency })
  }

  for (const row of data ?? []) {
    const stage = (row.stage as DealStage) ?? "qualify"
    const amountStr = row.amount != null ? String(row.amount) : "0"
    const currency = (row.currency as string) ?? defaultCurrency

    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1)

    if (currency === defaultCurrency) {
      const current = stageAmounts.get(stage)!
      const money = Money.fromAmount(amountStr, currency)
      current.cents += money.cents
    }
  }

  const stages: PipelineStageSummary[] = DEAL_STAGES.map((stage) => {
    const amount = stageAmounts.get(stage)!
    return {
      stage,
      // eslint-disable-next-line security/detect-object-injection
      label: STAGE_LABELS[stage],
      count: stageCounts.get(stage) ?? 0,
      totalAmount: Money.fromCents(amount.cents, defaultCurrency).toAmount(),
      currency: defaultCurrency,
    }
  })

  const totalCount = stages.reduce((sum, s) => sum + s.count, 0)
  const totalCents = stages.reduce(
    (sum, s) => sum + Money.fromAmount(s.totalAmount, defaultCurrency).cents,
    0,
  )

  return {
    stages,
    totalCount,
    totalAmount: Money.fromCents(totalCents, defaultCurrency).toAmount(),
    currency: defaultCurrency,
  }
}

function toDomainActivity(data: Record<string, unknown>): ActivityRecord {
  const author = data.author as { full_name: string } | null
  return {
    id: data.id as string,
    opportunityId: (data.opportunity_id as string) ?? null,
    accountId: (data.account_id as string) ?? null,
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
  _ctx: DashboardCallContext,
  limit = 10,
): Promise<ActivityRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("activities")
    .select(
      `
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
      author:user_id ( full_name )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to load recent activities: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainActivity(r as Record<string, unknown>))
}

function toDomainOpportunity(data: Record<string, unknown>): OpportunityRecord {
  const account = data.account as { name: string } | null
  const owner = data.owner as { full_name: string } | null
  const currency = (data.currency as string) ?? "USD"
  const amount = Money.fromAmount(String(data.amount ?? 0), currency).toAmount()
  return {
    id: data.id as string,
    name: data.name as string,
    accountId: data.account_id as string,
    accountName: account?.name ?? null,
    primaryContactId: (data.primary_contact_id as string) ?? null,
    stage: data.stage as DealStage,
    probabilityPct: Number(data.probability_pct ?? 0),
    amount,
    currency,
    ownerUserId: data.owner_user_id as string,
    ownerName: owner?.full_name ?? null,
    salesUnitId: data.sales_unit_id as string,
    description: (data.description as string) ?? null,
    closeDate: (data.close_date as string) ?? null,
    lossReason: (data.loss_reason as string) ?? null,
    customData: (data.custom_data ?? {}) as Record<string, unknown>,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getRecentDeals(
  _ctx: DashboardCallContext,
  limit = 5,
): Promise<OpportunityRecord[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("opportunities")
    .select(
      `
      id,
      name,
      account_id,
      primary_contact_id,
      stage,
      probability_pct,
      amount,
      currency,
      owner_user_id,
      sales_unit_id,
      description,
      close_date,
      loss_reason,
      custom_data,
      created_at,
      updated_at,
      account:account_id ( name ),
      owner:owner_user_id ( full_name )
    `,
    )
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to load recent deals: ${error.message}`)
  }

  return (data ?? []).map(toDomainOpportunity)
}
