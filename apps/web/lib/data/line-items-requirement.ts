import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import {
  getSalesProcessSettings,
  type SalesProcessSettingsCallContext,
} from "@/lib/data/sales-process-settings"
import {
  lineItemsRequiredAtStage,
  lineItemsRequirementUnmet,
  type DealStage,
  type LineItemsRequirementConfig,
} from "@/lib/opportunity"

/**
 * Batched line-items-requirement signal for board / table cards (ORR-753).
 * One settings read + at most two scoped queries for the whole visible list —
 * never per-card. Mirrors attachDealHealth.
 */

async function getLineItemsSignals(
  opportunityIds: string[],
): Promise<{ withLines: Set<string>; overridden: Set<string> }> {
  if (opportunityIds.length === 0) {
    return { withLines: new Set(), overridden: new Set() }
  }
  const supabase = await createServerClient()
  const [liRes, oppRes] = await Promise.all([
    // Presence-only DISTINCT server-side (ORR-757). The old .in() fetched EVERY
    // line-item row for the page's opps just to dedupe into a Set — which could
    // exceed the row cap on a large visible page; the RPC returns at most one row
    // per input id (RLS-scoped).
    supabase.rpc("opportunities_with_line_items", { _ids: opportunityIds }),
    supabase
      .from("opportunities")
      .select("id")
      .eq("line_items_amount_overridden", true)
      .in("id", opportunityIds),
  ])
  if (liRes.error) {
    throw new Error(`Failed to read line-item presence: ${liRes.error.message}`)
  }
  if (oppRes.error) {
    throw new Error(`Failed to read override flags: ${oppRes.error.message}`)
  }
  return {
    withLines: new Set(
      (liRes.data ?? []).map((r) => (r as { opportunity_id: string }).opportunity_id),
    ),
    overridden: new Set((oppRes.data ?? []).map((r) => (r as { id: string }).id)),
  }
}

export async function attachLineItemsWarning<T extends { id: string; stage: DealStage }>(
  ctx: SalesProcessSettingsCallContext,
  opportunities: T[],
): Promise<(T & { needsLineItems: boolean })[]> {
  const settings = await getSalesProcessSettings(ctx)
  const config: LineItemsRequirementConfig = {
    requiredFromStage: settings.lineItemsRequiredFromStage,
    overrideExempts: settings.lineItemsOverrideExempts,
  }

  // Feature off, or nothing on this page has reached the stage → no queries.
  if (!config.requiredFromStage) {
    return opportunities.map((o) => ({ ...o, needsLineItems: false }))
  }
  const candidateIds = opportunities
    .filter((o) => lineItemsRequiredAtStage(o.stage, config))
    .map((o) => o.id)
  if (candidateIds.length === 0) {
    return opportunities.map((o) => ({ ...o, needsLineItems: false }))
  }

  const { withLines, overridden } = await getLineItemsSignals(candidateIds)
  return opportunities.map((o) => ({
    ...o,
    needsLineItems: lineItemsRequirementUnmet({
      stage: o.stage,
      hasLineItems: withLines.has(o.id),
      amountOverridden: overridden.has(o.id),
      config,
    }),
  }))
}
