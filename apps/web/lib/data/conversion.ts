import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { DashboardContext } from "@/lib/data/metrics"
import type { DealStage } from "@/lib/opportunity/stage"
import { buildConversionFunnel } from "@/lib/opportunity/conversion-funnel"
import type { ConversionFunnelData } from "@/lib/opportunity/conversion-funnel"

/**
 * Load the Conversion-by-Stage funnel for the signed-in caller.
 *
 * Deal counts come from the `conversion_funnel_agg` SECURITY INVOKER RPC (one
 * bounded row per stage), so opportunity RLS and the Confidential-tier fence are
 * applied in the database before counting — never a client-side aggregate over
 * raw rows (which max_rows would silently truncate). The cumulative "reached"
 * series and conversion rates are then derived by the pure
 * {@link buildConversionFunnel}.
 *
 * Takes `ctx` per the dashboard data-fn convention (root AGENTS.md §8.7); RLS
 * identity still rides on the authenticated Supabase client. With
 * `teamOnly: true` (ORR-722) the RPC narrows to the caller's reporting subtree —
 * the "Team" tab funnel; `groupOnly: true` (ORR-723) narrows to the caller's
 * region/group entities — the "Group" tab funnel. Both sit on top of RLS, so they
 * can only ever remove deals.
 */
export async function getConversionFunnel(
  _ctx: DashboardContext,
  opts: { teamOnly?: boolean; groupOnly?: boolean } = {},
): Promise<ConversionFunnelData> {
  const supabase = await createServerClient()

  const { data, error } = await supabase.rpc("conversion_funnel_agg", {
    p_team_only: opts.teamOnly ?? false,
    p_group: opts.groupOnly ?? false,
  })
  if (error) {
    throw new Error(`Failed to load conversion funnel: ${error.message}`)
  }

  const countByStage: Partial<Record<DealStage, number>> = {}
  for (const row of (data ?? []) as { stage: string; deal_count: number | string }[]) {
    countByStage[row.stage as DealStage] = Number(row.deal_count)
  }

  return buildConversionFunnel(countByStage)
}
