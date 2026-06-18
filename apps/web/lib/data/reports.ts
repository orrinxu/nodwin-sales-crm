import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { DEAL_STAGES, isTerminalStage } from "@/lib/opportunity"
import type { DealStage } from "@/lib/opportunity"
import { getStageLabel } from "@/lib/data/opportunities.types"

export interface PipelineStageSummary {
  label: string
  count: number
  totalAmount: string
  currency: string
  stage: string
}

export interface PipelineSummary {
  stages: PipelineStageSummary[]
  totalAmount: string
  currency: string
  totalCount: number
}

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
}

export async function getReportData(): Promise<ReportData> {
  const supabase = await createServerClient()

  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select(`
      id,
      name,
      stage,
      amount,
      currency,
      close_date,
      created_at,
      account:account_id ( name )
    `)
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) {
    throw new Error(`Failed to load report data: ${error.message}`)
  }

  const raw = (opportunities ?? []) as Array<{
    id: string
    name: string
    stage: string
    amount: string | number
    currency: string
    close_date: string | null
    created_at: string
    account: Array<{ name: string }> | null
  }>

  const records = raw.map((r) => ({
    ...r,
    account: Array.isArray(r.account) && r.account.length > 0 ? r.account[0] : null,
  }))

  /* eslint-disable security/detect-object-injection -- dynamic map keys originate from typed constants or DB strings */
  const stageBuckets: Record<string, { count: number; amount: number }> = {}
  for (const stage of DEAL_STAGES) {
    stageBuckets[stage] = { count: 0, amount: 0 }
  }

  let totalWonAmount = 0
  let totalLostAmount = 0
  let wonCount = 0
  let lostCount = 0
  let openCount = 0
  let openAmount = 0

  const monthlyMap: Record<string, { created: number; won: number; amount: number }> = {}
  const accountMap: Record<string, { name: string; amount: number; count: number }> = {}

  for (const opp of records) {
    const stage = opp.stage as DealStage
    const amount = Number(opp.amount) || 0
    const bucket = stageBuckets[stage]
    if (bucket) {
      bucket.count++
      bucket.amount += amount
    }

    if (stage === "closed_won") {
      totalWonAmount += amount
      wonCount++
    } else if (stage === "closed_lost") {
      totalLostAmount += amount
      lostCount++
    } else {
      openCount++
      openAmount += amount
    }

    const month = (opp.created_at ?? "").slice(0, 7)
    if (month) {
      if (!monthlyMap[month]) {
        monthlyMap[month] = { created: 0, won: 0, amount: 0 }
      }
      monthlyMap[month].created++
      if (stage === "closed_won") {
        monthlyMap[month].won++
        monthlyMap[month].amount += amount
      }
    }

    const accountName = opp.account?.name ?? "Unknown"
    if (!accountMap[accountName]) {
      accountMap[accountName] = { name: accountName, amount: 0, count: 0 }
    }
    accountMap[accountName].amount += amount
    accountMap[accountName].count++
  }

  const pipelineByStage: PipelineByStage[] = DEAL_STAGES.filter(
    (s) => !isTerminalStage(s),
  ).map((stage) => ({
    stage,
    label: getStageLabel(stage),
    count: stageBuckets[stage]?.count ?? 0,
    amount: stageBuckets[stage]?.amount ?? 0,
  }))
  /* eslint-enable security/detect-object-injection */

  const wonLostRevenue: WonLostRevenue[] = [
    { type: "won", amount: totalWonAmount, count: wonCount },
    { type: "lost", amount: totalLostAmount, count: lostCount },
    { type: "open", amount: openAmount, count: openCount },
  ]

  const monthlyTrends: MonthlyTrend[] = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      created: data.created,
      won: data.won,
      amount: data.amount,
    }))

  const topAccounts: TopAccount[] = Object.values(accountMap)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)

  const totalPipeline = pipelineByStage.reduce((sum, s) => sum + s.amount, 0)
  const totalDeals = wonCount + lostCount
  const winRate = totalDeals > 0 ? Math.round((wonCount / totalDeals) * 100) : 0
  const avgDealSize = computeAverage(totalWonAmount, wonCount)

  return {
    pipelineByStage,
    wonLostRevenue,
    monthlyTrends,
    topAccounts,
    totalPipeline,
    totalWon: totalWonAmount,
    avgDealSize,
    winRate,
  }
}

function computeAverage(sum: number, count: number): number {
  return count > 0 ? Math.round(sum / count) : 0
}
