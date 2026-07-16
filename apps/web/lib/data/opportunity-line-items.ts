import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { Money } from "@/lib/money"

/**
 * Per-deal line items (ORR-749, §B of ORR-704).
 *
 * All amounts are in the parent opportunity's currency (no per-line currency).
 * `lineTotal` is a generated column (qty × unit_price × (1 − discount%)). The
 * whole set is replaced atomically via the replace_opportunity_line_items RPC so
 * a mid-write failure can't leave a deal with a partial line set. Rolling the
 * summed total into opportunities.amount is ORR-750 (§C).
 */

export interface LineItemsCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface OpportunityLineItem {
  id: string
  opportunityId: string
  productId: string | null
  description: string
  /** Decimal string; can be fractional (e.g. hours). */
  quantity: string
  /** Decimal string in the deal currency. */
  unitPriceAmount: string
  unitCostAmount: string
  discountPct: number
  position: number
  /** Generated: qty × unit_price × (1 − discount%), in the deal currency. */
  lineTotal: string
}

export const lineItemInputSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  description: z.string().min(1, "Description is required").max(500),
  quantity: z.number().positive().default(1),
  // Decimal strings; empty/undefined → 0.
  unitPriceAmount: z.string().max(30).optional(),
  unitCostAmount: z.string().max(30).optional(),
  discountPct: z.number().min(0).max(100).default(0),
  position: z.number().int().min(0).optional(),
})
export type LineItemInput = z.input<typeof lineItemInputSchema>

export const replaceLineItemsSchema = z.object({
  lines: z.array(lineItemInputSchema),
})

function toDomain(data: Record<string, unknown>, currency: string): OpportunityLineItem {
  return {
    id: data.id as string,
    opportunityId: data.opportunity_id as string,
    productId: (data.product_id as string) ?? null,
    description: data.description as string,
    quantity: String(data.quantity ?? "0"),
    unitPriceAmount: Money.fromAmount(String(data.unit_price_amount ?? 0), currency).toAmount(),
    unitCostAmount: Money.fromAmount(String(data.unit_cost_amount ?? 0), currency).toAmount(),
    discountPct: Number(data.discount_pct ?? 0),
    position: Number(data.position ?? 0),
    lineTotal: Money.fromAmount(String(data.line_total ?? 0), currency).toAmount(),
  }
}

/** The deal currency drives Money formatting; a missing opportunity → "USD". */
async function getOpportunityCurrency(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  opportunityId: string,
): Promise<string> {
  const { data } = await supabase
    .from("opportunities")
    .select("currency")
    .eq("id", opportunityId)
    .single()
  return (data?.currency as string) ?? "USD"
}

export async function getOpportunityLineItems(
  ctx: LineItemsCallContext,
  opportunityId: string,
): Promise<OpportunityLineItem[]> {
  void ctx
  const supabase = await createServerClient()
  const currency = await getOpportunityCurrency(supabase, opportunityId)

  const { data, error } = await supabase
    .from("opportunity_line_items")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .order("position", { ascending: true })

  if (error) {
    throw new Error(`Failed to load line items: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomain(r as Record<string, unknown>, currency))
}

/**
 * Replace an opportunity's entire line-item set atomically. An empty array clears
 * all lines. Amounts are normalised to the deal currency via Money (no float
 * math); `line_total` is generated in the DB and never sent.
 */
export async function replaceOpportunityLineItems(
  ctx: LineItemsCallContext,
  opportunityId: string,
  lines: LineItemInput[],
): Promise<void> {
  void ctx
  const parsed = replaceLineItemsSchema.parse({ lines })
  const supabase = await createServerClient()
  const currency = await getOpportunityCurrency(supabase, opportunityId)

  const rows = parsed.lines.map((line, index) => ({
    product_id: line.productId ?? null,
    description: line.description,
    quantity: line.quantity,
    unit_price_amount: Money.fromAmount(line.unitPriceAmount || "0", currency).toAmount(),
    unit_cost_amount: Money.fromAmount(line.unitCostAmount || "0", currency).toAmount(),
    discount_pct: line.discountPct,
    position: line.position ?? index,
  }))

  const { error } = await supabase.rpc("replace_opportunity_line_items", {
    _opportunity_id: opportunityId,
    _rows: rows,
  })

  if (error) {
    throw new Error(`Failed to save line items: ${error.message}`)
  }
}
