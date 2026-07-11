import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"

export interface FinanceCallContext {
  user: { id: string; email?: string; role?: string }
  source: "web" | "mcp" | "webhook" | "system"
}

export type FinancingCostMethod = "integral" | "peak_duration"
export type DeductionBase = "revenue" | "profit"

export interface CostOfCashSettings {
  /** Annual cost-of-financing rate as a decimal (0.18 = 18%/yr). */
  annualRate: number
  financingCostMethod: FinancingCostMethod
  deductionBase: DeductionBase
}

// Group-wide defaults until an admin saves a row. 18%/yr per D2; the integral
// method per D3; deduction over revenue per D6.
export const DEFAULT_COST_OF_CASH: CostOfCashSettings = {
  annualRate: 0.18,
  financingCostMethod: "integral",
  deductionBase: "revenue",
}

export const costOfCashUpdateSchema = z.object({
  annualRate: z.number().min(0).max(9.99999),
  financingCostMethod: z.enum(["integral", "peak_duration"]),
  deductionBase: z.enum(["revenue", "profit"]),
})
export type CostOfCashUpdateInput = z.infer<typeof costOfCashUpdateSchema>

function mapRow(r: Record<string, unknown>): CostOfCashSettings {
  return {
    annualRate: Number(r.annual_rate ?? DEFAULT_COST_OF_CASH.annualRate),
    financingCostMethod: (r.financing_cost_method as FinancingCostMethod) ?? "integral",
    deductionBase: (r.deduction_base as DeductionBase) ?? "revenue",
  }
}

/** The group-wide cost-of-cash settings (entity_id IS NULL), or the defaults
 *  when no admin has saved a row yet. Readable by any authenticated user (the
 *  working-capital derivation needs the rate). */
export async function getCostOfCashSettings(ctx: FinanceCallContext): Promise<CostOfCashSettings> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("cost_of_cash_settings")
    .select("annual_rate, financing_cost_method, deduction_base")
    .is("entity_id", null)
    .maybeSingle()
  if (error) throw new Error(`Failed to load cost-of-cash settings: ${error.message}`)
  return data ? mapRow(data as Record<string, unknown>) : DEFAULT_COST_OF_CASH
}

/** Upsert the single group-wide row. Admin-only, enforced by RLS. */
export async function setCostOfCashSettings(
  ctx: FinanceCallContext,
  input: CostOfCashUpdateInput,
): Promise<CostOfCashSettings> {
  void ctx
  const parsed = costOfCashUpdateSchema.parse(input)
  const supabase = await createServerClient()
  const row = {
    annual_rate: parsed.annualRate,
    financing_cost_method: parsed.financingCostMethod,
    deduction_base: parsed.deductionBase,
  }

  const { data: existing, error: readErr } = await supabase
    .from("cost_of_cash_settings")
    .select("id")
    .is("entity_id", null)
    .maybeSingle()
  if (readErr) throw new Error(`Failed to read cost-of-cash settings: ${readErr.message}`)

  if (existing) {
    const { error } = await supabase
      .from("cost_of_cash_settings")
      .update(row)
      .eq("id", (existing as { id: string }).id)
    if (error) throw new Error(`Failed to update cost-of-cash settings: ${error.message}`)
  } else {
    const { error } = await supabase
      .from("cost_of_cash_settings")
      .insert({ ...row, entity_id: null })
    if (error) throw new Error(`Failed to create cost-of-cash settings: ${error.message}`)
  }
  return parsed
}
