import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { DEAL_STAGES, isTerminalStage } from "@/lib/opportunity"
import type { DealStage } from "@/lib/opportunity"
import { getStageLabel } from "@/lib/data/opportunities.types"
import { Money } from "@/lib/money"
import { getReportingCurrency } from "@/lib/data/metrics"

export interface PipelineByStage {
  stage: string
  label: string
  count: number
  cents: number
}

export interface WonLostRevenue {
  type: "won" | "lost" | "open"
  cents: number
  count: number
}

export interface MonthlyTrend {
  month: string
  created: number
  won: number
  cents: number
}

export interface TopAccount {
  name: string
  cents: number
  count: number
}

export interface ReportData {
  pipelineByStage: PipelineByStage[]
  wonLostRevenue: WonLostRevenue[]
  monthlyTrends: MonthlyTrend[]
  topAccounts: TopAccount[]
  totalPipelineCents: number
  totalWonCents: number
  avgDealCents: number
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

  const reportingCurrency = getReportingCurrency()
  const stageMoneyMap: Record<string, Money> = {}
  for (const stage of DEAL_STAGES) {
    stageMoneyMap[stage] = Money.zero(reportingCurrency)
  }
  const stageCounts: Record<string, number> = {}
  for (const stage of DEAL_STAGES) {
    stageCounts[stage] = 0
  }

  let wonCents = Money.zero(reportingCurrency)
  let lostCents = Money.zero(reportingCurrency)
  let openCents = Money.zero(reportingCurrency)
  let wonCount = 0
  let lostCount = 0
  let openCount = 0

  type MonthlyEntry = { created: number; won: number; wonCents: Money }
  const monthlyMap: Record<string, MonthlyEntry> = {}
  type AccountEntry = { name: string; totalCents: Money; count: number }
  const accountEntries: Record<string, AccountEntry> = {}

  for (const opp of records) {
    const stage = opp.stage as DealStage
    const rawValue = opp.amount != null && String(opp.amount) !== "" ? String(opp.amount) : "0"
    const oppCurrency = opp.currency || reportingCurrency
    const money = Money.fromAmount(rawValue, oppCurrency)
    const isReportable = oppCurrency === reportingCurrency

    if (isReportable) {
      stageCounts[stage]++
      stageMoneyMap[stage] = stageMoneyMap[stage].add(money)
    }

    if (stage === "closed_won") {
      wonCount++
      if (isReportable) {
        wonCents = wonCents.add(money)
      }
    } else if (stage === "closed_lost") {
      lostCount++
      if (isReportable) {
        lostCents = lostCents.add(money)
      }
    } else {
      openCount++
      if (isReportable) {
        openCents = openCents.add(money)
      }
    }

    const month = (opp.created_at ?? "").slice(0, 7)
    if (month) {
      if (!monthlyMap[month]) {
        monthlyMap[month] = { created: 0, won: 0, wonCents: Money.zero(reportingCurrency) }
      }
      monthlyMap[month].created++
      if (stage === "closed_won" && isReportable) {
        monthlyMap[month].won++
        monthlyMap[month].wonCents = monthlyMap[month].wonCents.add(money)
      }
    }

    const accountName = opp.account?.name ?? "Unknown"
    if (!accountEntries[accountName]) {
      accountEntries[accountName] = { name: accountName, totalCents: Money.zero(reportingCurrency), count: 0 }
    }
    if (isReportable) {
      accountEntries[accountName].totalCents = accountEntries[accountName].totalCents.add(money)
    }
    accountEntries[accountName].count++
  }

  const pipelineByStage: PipelineByStage[] = DEAL_STAGES.filter(
    (s) => !isTerminalStage(s),
  ).map((stage) => ({
    stage,
    label: getStageLabel(stage),
    count: stageCounts[stage] ?? 0,
    cents: stageMoneyMap[stage]?.cents ?? 0,
  }))

  const wonLostRevenue: WonLostRevenue[] = [
    { type: "won", cents: wonCents.cents, count: wonCount },
    { type: "lost", cents: lostCents.cents, count: lostCount },
    { type: "open", cents: openCents.cents, count: openCount },
  ]

  const monthlyTrends: MonthlyTrend[] = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mon, entry]) => ({
      month: mon,
      created: entry.created,
      won: entry.won,
      cents: entry.wonCents.cents,
    }))

  const topAccounts: TopAccount[] = Object.values(accountEntries)
    .sort((a, b) => b.totalCents.cents - a.totalCents.cents)
    .slice(0, 10)
    .map((e) => ({ name: e.name, cents: e.totalCents.cents, count: e.count }))

  const pipelineByStageCents = pipelineByStage.reduce((sum, s) => sum + s.cents, 0)
  const totalDeals = wonCount + lostCount
  const winRate = totalDeals > 0 ? Math.round((wonCount / totalDeals) * 100) : 0
  const avgDealCents = wonCount > 0 ? Math.round(wonCents.cents / wonCount) : 0

  return {
    pipelineByStage,
    wonLostRevenue,
    monthlyTrends,
    topAccounts,
    totalPipelineCents: pipelineByStageCents,
    totalWonCents: wonCents.cents,
    avgDealCents,
    winRate,
  }
}
