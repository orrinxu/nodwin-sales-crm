import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { DEAL_STAGES, type DealStage } from "@/lib/opportunity"

/**
 * Global (singleton) sales-process settings (ORR-753). One row, id = true.
 */

export interface SalesProcessSettingsCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface SalesProcessSettings {
  /** Stage from which line items are expected (warning), or null when off. */
  lineItemsRequiredFromStage: DealStage | null
  /** When true, a manually-overridden deal amount waives the requirement. */
  lineItemsOverrideExempts: boolean
}

const DEFAULTS: SalesProcessSettings = {
  lineItemsRequiredFromStage: null,
  lineItemsOverrideExempts: true,
}

export const salesProcessSettingsUpdateSchema = z.object({
  lineItemsRequiredFromStage: z.enum(DEAL_STAGES).nullable().optional(),
  lineItemsOverrideExempts: z.boolean().optional(),
})
export type SalesProcessSettingsUpdateInput = z.input<typeof salesProcessSettingsUpdateSchema>

function toDomain(data: Record<string, unknown>): SalesProcessSettings {
  return {
    lineItemsRequiredFromStage:
      (data.line_items_required_from_stage as DealStage | null) ?? null,
    lineItemsOverrideExempts: (data.line_items_override_exempts as boolean) ?? true,
  }
}

export async function getSalesProcessSettings(
  ctx: SalesProcessSettingsCallContext,
): Promise<SalesProcessSettings> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("sales_process_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load sales-process settings: ${error.message}`)
  }
  return data ? toDomain(data as Record<string, unknown>) : DEFAULTS
}

export async function updateSalesProcessSettings(
  ctx: SalesProcessSettingsCallContext,
  input: SalesProcessSettingsUpdateInput,
): Promise<SalesProcessSettings> {
  void ctx
  const parsed = salesProcessSettingsUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData: Record<string, unknown> = { id: true }
  if (parsed.lineItemsRequiredFromStage !== undefined) {
    dbData.line_items_required_from_stage = parsed.lineItemsRequiredFromStage
  }
  if (parsed.lineItemsOverrideExempts !== undefined) {
    dbData.line_items_override_exempts = parsed.lineItemsOverrideExempts
  }

  const { data, error } = await supabase
    .from("sales_process_settings")
    .upsert(dbData as never, { onConflict: "id" })
    .select("*")
    .single()

  if (error) {
    throw new Error(`Failed to save sales-process settings: ${error.message}`)
  }
  return toDomain(data as Record<string, unknown>)
}
