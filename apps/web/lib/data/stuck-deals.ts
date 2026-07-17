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
  /** Deals excluded from value-at-risk because their currency has no FX rate to
   *  the reporting currency (surfaced, not silently hidden — CTO review M2). */
  unconvertibleCount: number
}

const DAY_MS = 86_400_000

// The stuck-deals widget shows the highest-value stuck deals; cap the display
// fetch so it can never silently truncate mid-set (ORR-757). The headline total
// is computed separately over the full set, so nothing is lost from the number.
const STUCK_DISPLAY_CAP = 200

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

  // Open deals only (RLS scopes to the viewer's entitled set). The DISPLAYED
  // list is bounded to the highest-value open deals (ORR-757) so the fetch can't
  // silently truncate mid-set; the headline totalValueAtRisk is computed
  // separately over the WHOLE stuck set by stuck_deals_value_at_risk below, so it
  // stays exact even when the list is capped.
  const { data: openDeals, error } = await supabase
    .from("opportunities")
    .select("id, name, stage, amount, currency, close_date, created_at, account:account_id ( name )")
    .in("stage", NON_TERMINAL_STAGES)
    .order("amount", { ascending: false })
    .limit(STUCK_DISPLAY_CAP)

  if (error) throw new Error(`Failed to load stuck deals: ${error.message}`)

  const rows = (openDeals ?? []) as unknown as OpenOppRaw[]
  if (rows.length === 0) {
    const currency = await resolveReportingCurrency(ctx)
    return { deals: [], currency, totalValueAtRisk: 0, unconvertibleCount: 0 }
  }

  // MAX(created_at) per opportunity via a server-side aggregate — one row per
  // opportunity (bounded by deal count, NOT activity count), so it can't be
  // truncated by max_rows the way a raw activity SELECT would be (CTO review H1).
  // The RPC is SECURITY INVOKER, so activities RLS still applies — a visible deal
  // can never have a hidden activity that mis-ages it.
  const ids = rows.map((r) => r.id)
  const { data: activityRows, error: actErr } = await supabase.rpc("stuck_deal_last_activity", {
    opp_ids: ids,
  })
  if (actErr) throw new Error(`Failed to load activity recency: ${actErr.message}`)

  const lastActivityByOpp = new Map<string, number>()
  for (const a of activityRows ?? []) {
    if (!a.opportunity_id || !a.last_activity_at) continue
    lastActivityByOpp.set(a.opportunity_id, new Date(a.last_activity_at).getTime())
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

  // Headline total across ALL stuck deals (not just the displayed page). The RPC
  // applies the SAME stale/overdue predicate server-side over the whole visible
  // open set and returns per-currency subtotals, which we FX-fold here. `deals`
  // above may be a value-capped subset, so its own sum would under-report —
  // that's exactly the truncation this replaces.
  const { data: atRiskRows, error: atRiskErr } = await supabase.rpc(
    "stuck_deals_value_at_risk",
    { _thresholds: thresholds as unknown as Record<string, number> },
  )
  if (atRiskErr) {
    throw new Error(`Failed to load value at risk: ${atRiskErr.message}`)
  }
  const { converted: atRiskConverted, unconvertibleCount: atRiskUnconvertible } =
    await fetchAndConvert(
      (atRiskRows ?? []).map((r) => ({
        stage: "",
        amount: Number(r.gross_amount) || 0,
        currency: r.currency,
        close_date: null,
      })),
      reportingCurrency,
    )
  const totalValueAtRisk = atRiskConverted.reduce((sum, r) => sum + r.amount, 0)

  return {
    deals,
    currency: reportingCurrency,
    totalValueAtRisk,
    unconvertibleCount: atRiskUnconvertible,
  }
}
