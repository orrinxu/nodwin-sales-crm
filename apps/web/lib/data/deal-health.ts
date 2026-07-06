import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { isTerminalStage } from "@/lib/opportunity/stage"
import { computeDealHealth } from "@/lib/opportunity/deal-health"
import type { DealHealth } from "@/lib/opportunity/deal-health"
import { resolveStuckThresholds } from "./stuck-deal-settings"
import type { OpenStage, StuckThresholds } from "./stuck-deal-settings"
import type { OpportunityRecord } from "./opportunities.types"
import type { OpportunityCallContext } from "./opportunities"

// Deal-card health signals (overdue / stale) for a WHOLE scoped opportunity set,
// computed in one batched pass — never per-card. Reuses the stuck-deals seam:
//   • last-activity comes from the SECURITY INVOKER `stuck_deal_last_activity`
//     aggregate RPC — one row per opportunity (bounded by deal count, not activity
//     count, so no max_rows truncation), and RLS-safe: a visible deal can never be
//     mis-aged by an activity the caller cannot see.
//   • thresholds from resolveStuckThresholds (per-open-stage, admin-configurable).
// The opportunities are already RLS-scoped by getOpportunities, so this adds no
// new visibility path — it only annotates rows the caller already sees.
//
// Days-in-stage is intentionally NOT computed here: there is no `stage_changed_at`
// column, and `opportunity_stage_history` RLS restricts SELECT to
// `created_by = auth.uid() OR admin`, so a batched latest-change query would be
// viewer-dependent (a deal whose stage was last advanced by someone else shows no
// row → a wrong/blank "days in stage"). A correct source needs a schema column +
// backfill, or a SECURITY DEFINER RPC — deferred.

type HealthInputRecord = Pick<
  OpportunityRecord,
  "id" | "stage" | "closeDate" | "createdAt"
>

/**
 * Batched health map for a scoped opportunity list. Only open deals with an
 * active signal get an entry; healthy / terminal deals are absent.
 */
export async function getDealHealthByOpportunity(
  _ctx: OpportunityCallContext,
  opportunities: HealthInputRecord[],
): Promise<Map<string, DealHealth>> {
  const result = new Map<string, DealHealth>()

  // Signals only apply to open deals; terminal deals carry none.
  const openOpps = opportunities.filter((o) => !isTerminalStage(o.stage))
  if (openOpps.length === 0) return result

  const supabase = await createServerClient()

  // ONE aggregate RPC for the whole set — no N+1, no truncation.
  const ids = openOpps.map((o) => o.id)
  const { data: activityRows, error } = await supabase.rpc(
    "stuck_deal_last_activity",
    { opp_ids: ids },
  )
  if (error) throw new Error(`Failed to load deal activity recency: ${error.message}`)

  const lastActivityByOpp = new Map<string, number>()
  for (const a of (activityRows ?? []) as {
    opportunity_id: string | null
    last_activity_at: string | null
  }[]) {
    if (!a.opportunity_id || !a.last_activity_at) continue
    lastActivityByOpp.set(a.opportunity_id, new Date(a.last_activity_at).getTime())
  }

  const thresholds: StuckThresholds = await resolveStuckThresholds()
  const nowMs = Date.now()

  for (const o of openOpps) {
    const stage = o.stage as OpenStage
    const health = computeDealHealth({
      stage: o.stage,
      closeDate: o.closeDate,
      createdAt: o.createdAt,
      lastActivityMs: lastActivityByOpp.get(o.id) ?? null,
      // eslint-disable-next-line security/detect-object-injection -- stage is constrained to open stages (isTerminalStage filtered above), not user input
      thresholdDays: thresholds[stage],
      nowMs,
    })
    if (health.overdue !== null || health.stale !== null) {
      result.set(o.id, health)
    }
  }

  return result
}

/**
 * Attach batched health signals to a scoped opportunity list. Deals with no
 * active signal get `health: null`. One RPC for the whole list — no per-card query.
 */
export async function attachDealHealth(
  ctx: OpportunityCallContext,
  opportunities: OpportunityRecord[],
): Promise<OpportunityRecord[]> {
  const healthByOpp = await getDealHealthByOpportunity(ctx, opportunities)
  return opportunities.map((o) => ({ ...o, health: healthByOpp.get(o.id) ?? null }))
}
