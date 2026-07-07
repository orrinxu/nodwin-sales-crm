import "server-only"
import { createServerClient } from "@/lib/supabase/server"
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
 * {@link buildConversionFunnel}. No `ctx` is needed: the authenticated Supabase
 * client already carries the caller's identity for RLS.
 */
export async function getConversionFunnel(): Promise<ConversionFunnelData> {
  const supabase = await createServerClient()

  const { data, error } = await supabase.rpc("conversion_funnel_agg")
  if (error) {
    throw new Error(`Failed to load conversion funnel: ${error.message}`)
  }

  const countByStage: Partial<Record<DealStage, number>> = {}
  for (const row of (data ?? []) as { stage: string; deal_count: number | string }[]) {
    countByStage[row.stage as DealStage] = Number(row.deal_count)
  }

  return buildConversionFunnel(countByStage)
}
