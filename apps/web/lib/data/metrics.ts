import "server-only"
import { cache } from "react"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { DEAL_STAGES, TERMINAL_STAGES } from "@/lib/opportunity"
import type { DealStage } from "@/lib/opportunity"
import { getStageLabel } from "@/lib/data/opportunities.types"
import type { ActivityRecord, ActivityType } from "./activities"
import { lookupRate, convertWithRate } from "@/lib/money/convert"
import type { RawRate } from "@/lib/money/convert"
import { getDisplayCurrency, getUserPreferences } from "@/lib/data/user-preferences"
import { resolveOrgReportingCurrency } from "@/lib/data/organisation-settings"

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
  /** Currency the `amount` is expressed in — the reporting currency when the
   *  deal was convertible, otherwise the deal's own currency (so the caller
   *  never formats a raw foreign amount under the reporting-currency symbol). */
  currency: string
  probabilityPct: number
  closeDate: string | null
}

// The org-wide static default reporting currency. Kept as the ultimate constant
// fallback; the real org default now comes from reporting_currency_settings via
// resolveOrgReportingCurrency (which falls back to this value).
export function getReportingCurrency(): string {
  return "USD"
}

// The currency dashboards/reports should render in for this user, two-tier:
//   per-user display_currency  ??  (per-entity override ?? group default ?? USD)
// All rollups funnel through here, so both the user preference and the org
// admin setting propagate to every converted total.
export async function resolveReportingCurrency(ctx: DashboardContext): Promise<string> {
  const preferred = await getDisplayCurrency(ctx)
  return preferred ?? (await resolveOrgReportingCurrency(ctx))
}

// The IANA timezone month-bucketing rollups should group created_at by (ORR-813).
// A deal created just after local midnight must fall in the caller's calendar
// month, not the server's — so report_monthly_agg buckets created_at AT TIME ZONE
// this value. Falls back to "UTC" (the RPC's own default) when the user has set
// none, matching resolveCloseDate's tz-aware close resolution (ORR-797). Postgres
// AT TIME ZONE assumes a valid zone name, the same assumption todayInTimeZone makes.
export async function resolveReportTimeZone(ctx: DashboardContext): Promise<string> {
  const prefs = await getUserPreferences(ctx)
  return prefs.timezone ?? "UTC"
}

// `currencies` is a tiny, request-stable reference table that was re-queried once
// per rollup (~8-10× per dashboard/reports render). Load it ONCE per request
// (ORR-765) and filter in memory — cheaper than N filtered round-trips.
const loadCurrencyScales = cache(async (): Promise<Map<string, number>> => {
  const supabase = await createServerClient()
  const { data } = await supabase.from("currencies").select("code, scale")
  const map = new Map<string, number>()
  for (const c of data ?? []) {
    map.set(c.code as string, c.scale as number)
  }
  return map
})

async function getCurrencyScaleMap(currencies: Iterable<string>): Promise<Map<string, number>> {
  const all = await loadCurrencyScales()
  const map = new Map<string, number>()
  for (const code of new Set(currencies)) {
    const scale = all.get(code)
    if (scale !== undefined) map.set(code, scale)
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
  const today = new Date().toISOString().slice(0, 10)

  for (const opp of raw) {
    // Rate-as-of rule: closed deals convert at their realised close_date's rate;
    // OPEN deals convert at today's latest rate. An open deal's close_date is an
    // *expected* (often future) date — converting at it would use a stale/absent
    // rate and disagree with the pipeline totals, which use today. Aggregate
    // buckets pass a non-terminal/blank stage and correctly get today's rate.
    const isClosed = (TERMINAL_STAGES as string[]).includes(opp.stage)
    const asOfDate = isClosed ? (opp.close_date ?? today) : today

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

// ── Pipeline aggregate (perf audit 2026-07-16) ───────────────────────────────
// getPipelineMetrics/getPipelineSummary previously fetched EVERY opportunity and
// reduced in JS — silently truncated at PostgREST's 1000-row cap, so the headline
// numbers under-reported. This folds the bounded pipeline_metrics_agg() RPC (per
// stage × currency) through fetchAndConvert at today's rate (asOf null), mirroring
// forecast_pipeline_agg. deal_count is the per-bucket multiplier; unconvertible
// deals = total − converted (preserving the prior per-deal semantics).
interface PipelineBucketRow {
  stage: string
  currency: string
  gross_amount: number
  deal_count: number
}

interface PipelineBuckets {
  buckets: Array<{ stage: string; amount: number; dealCount: number }>
  convertedDealCount: number
  unconvertibleCount: number
  currency: string
}

// The pipeline_metrics_agg RPC is arg-less and RLS-scoped, so it's request-stable.
// getPipelineMetrics AND getPipelineSummary both call loadPipelineBuckets, so the
// dashboard fired the RPC twice — cache() collapses it to one call per request
// (ORR-765).
const loadPipelineMetricsRows = cache(async (): Promise<PipelineBucketRow[]> => {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc("pipeline_metrics_agg")
  if (error) {
    throw new Error(`Failed to load pipeline metrics: ${error.message}`)
  }
  return (data ?? []) as PipelineBucketRow[]
})

async function loadPipelineBuckets(ctx: DashboardContext): Promise<PipelineBuckets> {
  const rows = await loadPipelineMetricsRows()
  const reportingCurrency = await resolveReportingCurrency(ctx)

  let totalDealCount = 0
  for (const r of rows) totalDealCount += Number(r.deal_count)

  const { converted } = await fetchAndConvert(
    rows.map((r) => ({
      stage: r.stage,
      amount: r.gross_amount,
      currency: r.currency,
      close_date: null,
      dealCount: Number(r.deal_count),
    })),
    reportingCurrency,
  )

  const buckets = converted.map((c) => ({ stage: c.stage, amount: c.amount, dealCount: c.dealCount }))
  let convertedDealCount = 0
  for (const b of buckets) convertedDealCount += b.dealCount

  return {
    buckets,
    convertedDealCount,
    unconvertibleCount: totalDealCount - convertedDealCount,
    currency: reportingCurrency,
  }
}

export async function getPipelineMetrics(ctx: DashboardContext): Promise<PipelineMetrics> {
  const { buckets, unconvertibleCount, currency: reportingCurrency } =
    await loadPipelineBuckets(ctx)

  let pipelineValue = 0
  let dealsWon = 0
  let dealsLost = 0
  let wonAmount = 0

  for (const b of buckets) {
    if (b.stage === "closed_won") {
      dealsWon += b.dealCount
      wonAmount += b.amount
    } else if (b.stage === "closed_lost") {
      dealsLost += b.dealCount
    } else {
      pipelineValue += b.amount
    }
  }

  const totalDeals = dealsWon + dealsLost
  const winRate = totalDeals > 0 ? Math.round((dealsWon / totalDeals) * 100) : 0

  // Avg deal size = average value of WON deals (ORR-813). This is the same
  // won-only definition getReportData uses on /reports, so the dashboard strip
  // and the reports card agree. Previously this divided all-stage amount
  // (including lost) by every converted deal — disagreeing with reports one
  // click away and violating its own "won" selector doc.
  const avgDealSize = computeAverage(wonAmount, dealsWon)

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
  const { buckets, currency: reportingCurrency } = await loadPipelineBuckets(ctx)

  const stageBuckets = new Map<string, { count: number; amount: number }>()

  for (const stage of DEAL_STAGES) {
    stageBuckets.set(stage, { count: 0, amount: 0 })
  }

  let totalAmount = 0
  let totalCount = 0

  for (const b of buckets) {
    totalCount += b.dealCount
    totalAmount += b.amount

    const sb = stageBuckets.get(b.stage)
    if (sb) {
      sb.count += b.dealCount
      sb.amount += b.amount
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
      currency,
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

  const rows = (rawDeals ?? []) as Array<Record<string, unknown>>

  // Convert each deal into the reporting currency so amounts aren't rendered
  // under the wrong symbol. Unlike the aggregate metrics, a recent-deals row is
  // never dropped when there's no rate — it keeps its own currency so the caller
  // can format it correctly rather than mixing it into the reporting total.
  const reportingCurrency = await resolveReportingCurrency(ctx)
  const currencies = new Set<string>([reportingCurrency])
  for (const d of rows) currencies.add((d.currency as string) ?? reportingCurrency)
  const scaleMap = await getCurrencyScaleMap(currencies)
  const rateCache = new Map<string, RawRate | null>()

  const deals: RecentDealRecord[] = []
  for (const d of rows) {
    const account = d.account as { name: string } | null
    const stage = (d.stage as DealStage) ?? "qualify"
    // eslint-disable-next-line custom/no-unsafe-numeric-coercion -- display figure, coerced as the prior getRecentDeals did, then fed into the bigint-safe convertAmount for the actual money math
    const origAmount = Number(d.amount ?? 0)
    const origCurrency = (d.currency as string) ?? reportingCurrency
    const closeDate = (d.close_date as string) ?? null
    const asOfDate = closeDate ?? new Date().toISOString().slice(0, 10)

    const { convertedAmount } = await convertAmount(
      origAmount,
      origCurrency,
      reportingCurrency,
      asOfDate,
      scaleMap,
      rateCache,
    )
    const converted = convertedAmount !== null

    deals.push({
      id: d.id as string,
      name: d.name as string,
      company: account?.name ?? null,
      stage,
      stageLabel: getStageLabel(stage),
      amount: converted ? convertedAmount : origAmount,
      currency: converted ? reportingCurrency : origCurrency,
      probabilityPct: Number(d.probability_pct ?? 0),
      closeDate,
    })
  }

  return deals
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
  starts_at,
  ends_at,
  time_zone,
  all_day,
  external_event_id,
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
    startsAt: (data.starts_at as string) ?? null,
    endsAt: (data.ends_at as string) ?? null,
    timeZone: (data.time_zone as string) ?? null,
    allDay: (data.all_day as boolean) ?? false,
    externalEventId: (data.external_event_id as string) ?? null,
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
