import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { DEAL_STAGES } from "@/lib/opportunity"
import type { DealStage } from "@/lib/opportunity"
import { getStageLabel } from "@/lib/data/opportunities.types"
import type { ActivityRecord, ActivityType } from "./activities"
import { lookupRate, convertWithRate } from "@/lib/money/convert"
import type { RawRate } from "@/lib/money/convert"
import { getDisplayCurrency } from "@/lib/data/user-preferences"

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

// The org-wide default reporting currency (fallback when a user has no
// display-currency preference).
export function getReportingCurrency(): string {
  return "USD"
}

// The currency dashboards/reports should render in for this user: their
// display_currency preference if set, otherwise the org default. All rollups
// funnel through here, so the preference propagates to every converted total.
export async function resolveReportingCurrency(ctx: DashboardContext): Promise<string> {
  const preferred = await getDisplayCurrency(ctx)
  return preferred ?? getReportingCurrency()
}

async function getCurrencyScaleMap(currencies: Iterable<string>): Promise<Map<string, number>> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from("currencies")
    .select("code, scale")
    .in("code", Array.from(new Set(currencies)))

  const map = new Map<string, number>()
  for (const c of (data ?? [])) {
    map.set(c.code, c.scale)
  }
  return map
}

async function convertAmount(
  amount: number,
  fromCurrency: string,
  reportingCurrency: string,
  asOfDate: string,
  scaleMap: Map<string, number>,
  rateCache: Map<string, RawRate | null>,
): Promise<{ convertedAmount: number | null }> {
  if (fromCurrency === reportingCurrency) {
    return { convertedAmount: amount }
  }

  const cacheKey = `${fromCurrency}:${reportingCurrency}:${asOfDate}`
  let rate = rateCache.get(cacheKey)
  if (rate === undefined) {
    rate = await lookupRate(fromCurrency, reportingCurrency, asOfDate)
    rateCache.set(cacheKey, rate)
  }

  if (!rate) {
    return { convertedAmount: null }
  }

  const fromScale = scaleMap.get(fromCurrency) ?? 2
  const toScale = scaleMap.get(reportingCurrency) ?? 2

  // Convert from decimal amount to smallest currency unit (cents)
  // eslint-disable-next-line custom/no-unsafe-numeric-coercion -- utility conversion helper for exchange rate math, not direct money arithmetic
  const amountInCents = BigInt(Math.round(amount * Math.pow(10, fromScale)))

  const resultInCents = convertWithRate(
    amountInCents,
    fromCurrency,
    reportingCurrency,
    fromScale,
    toScale,
    rate,
  )

  // Convert back from cents to decimal amount
  const convertedAmount = Number(resultInCents) / Math.pow(10, toScale)

  return { convertedAmount }
}

export type OpportunityRaw = {
  stage: string
  amount: number | null
  currency: string
  close_date?: string | null
}

export async function fetchAndConvert<T extends OpportunityRaw>(
  data: T[] | null,
  reportingCurrency: string,
): Promise<{ converted: Array<T & { amount: number; currency: string }>; unconvertibleCount: number }> {
  const raw = (data ?? []) as T[]

  const allCurrencies = new Set<string>()
  for (const opp of raw) {
    allCurrencies.add(opp.currency)
  }
  allCurrencies.add(reportingCurrency)

  const scaleMap = await getCurrencyScaleMap(allCurrencies)
  const rateCache = new Map<string, RawRate | null>()

  const converted: Array<T & { amount: number; currency: string }> = []
  let unconvertibleCount = 0

  for (const opp of raw) {
    // Rate-as-of rule: use close_date for closed deals, latest rate for open deals
    const asOfDate = opp.close_date ?? new Date().toISOString().slice(0, 10)

    const result = await convertAmount(
      opp.amount ?? 0,
      opp.currency,
      reportingCurrency,
      asOfDate,
      scaleMap,
      rateCache,
    )

    if (result.convertedAmount === null) {
      unconvertibleCount++
      continue
    }

    converted.push({
      ...opp,
      amount: result.convertedAmount,
      currency: reportingCurrency,
    })
  }

  return { converted, unconvertibleCount }
}

export async function getPipelineMetrics(ctx: DashboardContext): Promise<PipelineMetrics> {
  const supabase = await createServerClient()

  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("stage, amount, currency, close_date")

  if (error) {
    throw new Error(`Failed to load pipeline metrics: ${error.message}`)
  }

  const reportingCurrency = await resolveReportingCurrency(ctx)
  const { converted: deals, unconvertibleCount } = await fetchAndConvert(
    opportunities,
    reportingCurrency,
  )

  let pipelineValue = 0
  let dealsWon = 0
  let dealsLost = 0
  let totalAmount = 0
  let activeCount = 0

  for (const opp of deals) {
    totalAmount += opp.amount

    if (opp.stage === "closed_won") {
      dealsWon++
    } else if (opp.stage === "closed_lost") {
      dealsLost++
    } else {
      pipelineValue += opp.amount
      activeCount++
    }
  }

  const totalDeals = dealsWon + dealsLost
  const winRate = totalDeals > 0 ? Math.round((dealsWon / totalDeals) * 100) : 0

  const avgDealSize = computeAverage(totalAmount, dealsWon + activeCount)

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

function computeAverage(sum: number, count: number): number {
  return count > 0 ? Math.round(sum / count) : 0
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
    .select("stage, amount, currency, close_date")

  if (error) {
    throw new Error(`Failed to load pipeline summary: ${error.message}`)
  }

  const reportingCurrency = await resolveReportingCurrency(ctx)
  const { converted: deals, unconvertibleCount } = await fetchAndConvert(
    opportunities,
    reportingCurrency,
  )

  const stageBuckets = new Map<string, { count: number; amount: number }>()

  for (const stage of DEAL_STAGES) {
    stageBuckets.set(stage, { count: 0, amount: 0 })
  }

  let totalAmount = 0
  let totalCount = 0

  for (const opp of deals) {
    const stage = opp.stage as DealStage
    const countInStage = stageBuckets.has(stage)

    totalCount++

    if (countInStage) {
      stageBuckets.get(stage)!.count++
    }

    totalAmount += opp.amount

    if (countInStage) {
      stageBuckets.get(stage)!.amount += opp.amount
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
    contactId: (data.contact_id as string) ?? null,
    contactName: null,
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
