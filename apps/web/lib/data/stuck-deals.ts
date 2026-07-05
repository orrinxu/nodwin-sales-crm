import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { DealStage } from "@/lib/opportunity/stage"
import { NON_TERMINAL_STAGES } from "@/lib/opportunity/stage"
import { getStageLabel } from "@/lib/data/opportunities.types"
import { fetchAndConvert, resolveReportingCurrency } from "./metrics"
import type { DashboardContext } from "./metrics"
import { resolveStuckThresholds } from "./stuck-deal-settings"
import type { OpenStage, StuckThresholds } from "./stuck-deal-settings"

// ORR-103: "Stuck Deals" attention widget. Surfaces OPEN deals the viewer is
// entitled to see (RLS on opportunities + activities does the scoping — we add no
// visibility path) that have gone quiet past their per-stage threshold, or whose
// close_date has passed while still open.

export type StuckReason = "stale" | "overdue"

export interface StuckDeal {
  id: string
  name: string
  company: string | null
  stage: DealStage
  stageLabel: string
  /** Value-at-risk: amount converted into the viewer's reporting currency. */
  amount: number
  currency: string
  daysSinceLastActivity: number
  thresholdDays: number
  hasActivity: boolean
  reasons: StuckReason[]
  closeDate: string | null
}

export interface StuckDealsResult {
  deals: StuckDeal[]
  currency: string
  totalValueAtRisk: number
}

const DAY_MS = 86_400_000

type OpenOppRaw = {
  id: string
  name: string
  stage: string
  amount: number | null
  currency: string
  close_date: string | null
  created_at: string
  account: { name: string } | null
}

/**
 * The staleness signal is MAX(activities.created_at) per opportunity — NEVER
 * opportunities.updated_at (which moves on any edit). A deal with no activity at
 * all is aged from its own created_at as the baseline (still not updated_at).
 */
export async function getStuckDeals(ctx: DashboardContext): Promise<StuckDealsResult> {
  const supabase = await createServerClient()

  // Open deals only (RLS scopes to the viewer's entitled set).
  const { data: openDeals, error } = await supabase
    .from("opportunities")
    .select("id, name, stage, amount, currency, close_date, created_at, account:account_id ( name )")
    .in("stage", NON_TERMINAL_STAGES)

  if (error) throw new Error(`Failed to load stuck deals: ${error.message}`)

  const rows = (openDeals ?? []) as unknown as OpenOppRaw[]
  if (rows.length === 0) {
    const currency = await resolveReportingCurrency(ctx)
    return { deals: [], currency, totalValueAtRisk: 0 }
  }

  // MAX(created_at) per opportunity, aggregated in-app from a single scoped query.
  // (activities RLS keys on the same opportunity_visibility as opportunities, so
  // no visible deal can have a hidden activity that would mis-age it.)
  const ids = rows.map((r) => r.id)
  const { data: activityRows, error: actErr } = await supabase
    .from("activities")
    .select("opportunity_id, created_at")
    .in("opportunity_id", ids)
  if (actErr) throw new Error(`Failed to load activity recency: ${actErr.message}`)

  const lastActivityByOpp = new Map<string, number>()
  for (const a of activityRows ?? []) {
    const oppId = a.opportunity_id as string | null
    if (!oppId) continue
    const t = new Date(a.created_at as string).getTime()
    const prev = lastActivityByOpp.get(oppId)
    if (prev === undefined || t > prev) lastActivityByOpp.set(oppId, t)
  }

  const thresholds: StuckThresholds = await resolveStuckThresholds()
  const reportingCurrency = await resolveReportingCurrency(ctx)
  const { converted } = await fetchAndConvert(rows, reportingCurrency)

  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10)

  const deals: StuckDeal[] = []
  for (const opp of converted) {
    const stage = opp.stage as OpenStage
    // eslint-disable-next-line security/detect-object-injection -- stage is a constrained OpenStage (query filters to NON_TERMINAL_STAGES), not user input
    const threshold = thresholds[stage]
    const lastActivityMs = lastActivityByOpp.get(opp.id)
    const hasActivity = lastActivityMs !== undefined
    const baselineMs = lastActivityMs ?? new Date(opp.created_at).getTime()
    const daysSinceLastActivity = Math.max(0, Math.floor((now - baselineMs) / DAY_MS))

    const reasons: StuckReason[] = []
    if (daysSinceLastActivity >= threshold) reasons.push("stale")
    if (opp.close_date !== null && opp.close_date < today) reasons.push("overdue")
    if (reasons.length === 0) continue

    deals.push({
      id: opp.id,
      name: opp.name,
      company: opp.account?.name ?? null,
      stage: stage as DealStage,
      stageLabel: getStageLabel(stage as DealStage),
      amount: opp.amount,
      currency: reportingCurrency,
      daysSinceLastActivity,
      thresholdDays: threshold,
      hasActivity,
      reasons,
      closeDate: opp.close_date,
    })
  }

  // Sort by value-at-risk (converted amount) descending.
  deals.sort((a, b) => b.amount - a.amount)

  const totalValueAtRisk = deals.reduce((sum, d) => sum + d.amount, 0)
  return { deals, currency: reportingCurrency, totalValueAtRisk }
}
