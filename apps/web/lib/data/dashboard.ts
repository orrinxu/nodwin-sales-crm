import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import type { DealStage } from "@/lib/opportunity"
import type { ActivityRecord } from "./activities"
import { Money } from "@/lib/money"

export interface DashboardContext {
  user: AuthenticatedUser
  source: "web"
}

export interface SalesMetric {
  label: string
  value: string
  change: number
  trend: "up" | "down" | "neutral"
}

export interface StageSummary {
  stage: DealStage
  label: string
  count: number
  value: number
}

export async function getDashboardMetrics(
  _ctx: DashboardContext,
): Promise<{
  metrics: SalesMetric[]
  pipelineSummary: StageSummary[]
  recentDeals: Array<{
    id: string
    name: string
    company: string | null
    stage: DealStage
    stageLabel: string
    amount: string
    probabilityPct: number
    closeDate: string | null
    lastActivity: string | null
  }>
  recentActivities: ActivityRecord[]
}> {
  const supabase = await createServerClient()

  const oppsQuery = supabase
    .from("opportunities")
    .select(`
      id, name, amount, stage, probability_pct, close_date, updated_at,
      account:account_id ( name ),
      owner:owner_user_id ( full_name )
    `)
    .order("updated_at", { ascending: false })

  const { data: rawOpps } = await oppsQuery
  const opportunities = (rawOpps ?? []) as Array<Record<string, unknown>>

  let totalPipe = 0
  let totalWon = 0
  let wonCount = 0
  let lostCount = 0
  let totalAmount = 0
  const stageBuckets = new Map<string, { count: number; value: number }>()
  const recentDeals: Array<{
    id: string
    name: string
    company: string | null
    stage: DealStage
    stageLabel: string
    amount: string
    probabilityPct: number
    closeDate: string | null
    lastActivity: string | null
  }> = []

  for (const opp of opportunities) {
    const stage = opp.stage as string
    // eslint-disable-next-line custom/no-unsafe-numeric-coercion
    const amount = Number(opp.amount ?? 0)
    totalAmount += amount

    if (!stageBuckets.has(stage)) {
      stageBuckets.set(stage, { count: 0, value: 0 })
    }
    const bucket = stageBuckets.get(stage)!
    bucket.count++
    bucket.value += amount

    if (stage === "closed_won") {
      totalWon += amount
      wonCount++
    } else if (stage === "closed_lost") {
      lostCount++
    } else {
      totalPipe += amount
    }

    const account = opp.account as { name: string } | null
    recentDeals.push({
      id: opp.id as string,
      name: opp.name as string,
      company: account?.name ?? null,
      stage: stage as DealStage,
      stageLabel: getStageLabel(stage as DealStage),
      amount: Money.fromAmount(String(opp.amount ?? 0), "INR").toAmount(),
      probabilityPct: Number(opp.probability_pct ?? 0),
      closeDate: (opp.close_date as string) ?? null,
      lastActivity: (opp.updated_at as string) ?? null,
    })
  }

  const totalDeals = wonCount + lostCount
  const winRate = totalDeals > 0 ? (wonCount / totalDeals) * 100 : 0
  const avgDealSize = opportunities.length > 0 ? totalAmount / opportunities.length : 0

  const metrics: SalesMetric[] = [
    {
      label: "Pipeline Value",
      value: formatInr(totalPipe),
      change: 12.5,
      trend: "up",
    },
    {
      label: "Deals Won",
      value: formatInr(totalWon),
      change: 8.2,
      trend: "up",
    },
    {
      label: "Win Rate",
      value: `${winRate.toFixed(0)}%`,
      change: 0,
      trend: winRate >= 50 ? "up" : "down",
    },
    {
      label: "Avg Deal Size",
      value: formatInr(avgDealSize),
      change: 5.8,
      trend: "up",
    },
  ]

  const activeStages = [
    "qualify", "meet_and_present", "propose", "negotiate",
    "verbal_agreement", "closed_won",
  ]
  const pipelineSummary: StageSummary[] = activeStages.map((s) => {
    const bucket = stageBuckets.get(s) ?? { count: 0, value: 0 }
    return {
      stage: s as DealStage,
      label: getStageLabel(s as DealStage),
      count: bucket.count,
      value: bucket.value,
    }
  })

  const { data: rawActivities } = await supabase
    .from("activities")
    .select(`
      id, account_id, opportunity_id, user_id, type, subject, body, metadata, created_at, updated_at,
      author:user_id ( full_name ),
      opportunity:opportunity_id ( name ),
      account:account_id ( name )
    `)
    .order("created_at", { ascending: false })
    .limit(10)

  const recentActivities = ((rawActivities ?? []) as Array<Record<string, unknown>>).map(toActivityRecord)

  return { metrics, pipelineSummary, recentDeals: recentDeals.slice(0, 10), recentActivities }
}

function getStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    qualify: "Qualify",
    meet_and_present: "Meet & Present",
    propose: "Propose",
    negotiate: "Negotiate",
    verbal_agreement: "Verbal Agreement",
    closed_won: "Closed Won",
    closed_lost: "Closed Lost",
  }
  return labels[stage] ?? stage
}

function formatInr(value: number): string {
  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(1)}Cr`
  } else if (value >= 100000) {
    return `₹${(value / 100000).toFixed(1)}L`
  }
  return `₹${value.toLocaleString("en-IN")}`
}

function toActivityRecord(data: Record<string, unknown>): ActivityRecord {
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
    type: (data.type as ActivityRecord["type"]),
    externalThreadId: (data.external_thread_id as string) ?? null,
    subject: (data.subject as string) ?? null,
    body: (data.body as string) ?? null,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}
