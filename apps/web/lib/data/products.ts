import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { Money } from "@/lib/money"

/**
 * Product catalog (ORR-748, §A of ORR-704).
 *
 * A small admin-managed catalog of sellable products/services. The unit price is
 * stored as an (amount, currency) Money pair, matching the opportunity amount
 * convention, so per-deal line items (ORR-749) can sum line totals into the deal
 * amount without float math.
 */

export interface ProductCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface ProductRecord {
  id: string
  name: string
  sku: string | null
  description: string | null
  /** Decimal string in `unitPriceCurrency` (never a float). */
  unitPriceAmount: string
  /** Default unit cost (same currency), used to prefill line-item cost. */
  unitCostAmount: string
  unitPriceCurrency: string
  active: boolean
  displayOrder: number
  createdAt: string
  updatedAt: string
}

export const productCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  sku: z.string().max(64).nullable().optional().or(z.literal("")),
  description: z.string().max(2000).nullable().optional().or(z.literal("")),
  // Decimal string, e.g. "5000" or "199.99". Empty/undefined → 0.
  unitPriceAmount: z.string().max(30).optional(),
  unitCostAmount: z.string().max(30).optional(),
  unitPriceCurrency: z.string().max(10).optional(),
  displayOrder: z.number().int().min(0).default(0),
  active: z.boolean().optional(),
})

export const productUpdateSchema = productCreateSchema.partial()

export type ProductCreateInput = z.input<typeof productCreateSchema>
export type ProductUpdateInput = z.input<typeof productUpdateSchema>

function toDomainProduct(data: Record<string, unknown>): ProductRecord {
  const currency = (data.unit_price_currency as string) ?? "USD"
  return {
    id: data.id as string,
    name: data.name as string,
    sku: (data.sku as string) ?? null,
    description: (data.description as string) ?? null,
    unitPriceAmount: Money.fromAmount(
      String(data.unit_price_amount ?? 0),
      currency,
    ).toAmount(),
    unitCostAmount: Money.fromAmount(
      String(data.unit_cost_amount ?? 0),
      currency,
    ).toAmount(),
    unitPriceCurrency: currency,
    active: (data.active as boolean) ?? true,
    displayOrder: (data.display_order as number) ?? 0,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

/**
 * List catalog products. Returns active and inactive rows (the admin screen shows
 * both); callers that only want sellable products should filter on `active`.
 */
export async function getAllProducts(
  ctx: ProductCallContext,
): Promise<ProductRecord[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("display_order", { ascending: true })

  if (error) {
    throw new Error(`Failed to load products: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainProduct(r as Record<string, unknown>))
}

export async function createProduct(
  ctx: ProductCallContext,
  input: ProductCreateInput,
): Promise<ProductRecord> {
  void ctx
  const parsed = productCreateSchema.parse(input)
  const supabase = await createServerClient()

  const currency = parsed.unitPriceCurrency || "USD"
  const dbData: Record<string, unknown> = {
    name: parsed.name,
    sku: parsed.sku || null,
    description: parsed.description || null,
    unit_price_amount: Money.fromAmount(
      parsed.unitPriceAmount || "0",
      currency,
    ).toAmount(),
    unit_cost_amount: Money.fromAmount(
      parsed.unitCostAmount || "0",
      currency,
    ).toAmount(),
    unit_price_currency: currency,
    display_order: parsed.displayOrder,
  }
  if (parsed.active !== undefined) dbData.active = parsed.active

  const { data, error } = await supabase
    .from("products")
    .insert(dbData as never)
    .select("*")
    .single()

  if (error) {
    throw new Error(`Failed to create product: ${error.message}`)
  }

  return toDomainProduct(data as Record<string, unknown>)
}

export async function updateProduct(
  ctx: ProductCallContext,
  id: string,
  input: ProductUpdateInput,
): Promise<ProductRecord> {
  void ctx
  const parsed = productUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = {}
  if (parsed.name !== undefined) dbData.name = parsed.name
  if (parsed.sku !== undefined) dbData.sku = parsed.sku || null
  if (parsed.description !== undefined) dbData.description = parsed.description || null
  if (parsed.displayOrder !== undefined) dbData.display_order = parsed.displayOrder
  if (parsed.active !== undefined) dbData.active = parsed.active

  // The price field is submitted as amount + currency together. If only the
  // currency changes, relabel without reconverting the stored decimal.
  if (parsed.unitPriceAmount !== undefined) {
    const currency = parsed.unitPriceCurrency || "USD"
    dbData.unit_price_amount = Money.fromAmount(parsed.unitPriceAmount, currency).toAmount()
    dbData.unit_price_currency = currency
  } else if (parsed.unitPriceCurrency !== undefined) {
    dbData.unit_price_currency = parsed.unitPriceCurrency
  }
  if (parsed.unitCostAmount !== undefined) {
    const currency = parsed.unitPriceCurrency || "USD"
    dbData.unit_cost_amount = Money.fromAmount(parsed.unitCostAmount, currency).toAmount()
  }

  if (Object.keys(dbData).length === 0) {
    throw new Error("No fields to update")
  }

  const { data, error } = await supabase
    .from("products")
    .update(dbData as never)
    .eq("id", id)
    .select("*")
    .single()

  if (error) {
    throw new Error(`Failed to update product: ${error.message}`)
  }

  return toDomainProduct(data as Record<string, unknown>)
}

export async function deactivateProduct(
  ctx: ProductCallContext,
  id: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("products")
    .update({ active: false } as never)
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to deactivate product: ${error.message}`)
  }
}
