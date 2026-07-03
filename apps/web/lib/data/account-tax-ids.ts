import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface AccountTaxIdsCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface TaxIdType {
  code: string
  label: string
  countryIso: string
  formatRegex: string | null
  displayOrder: number
}

export interface AccountTaxId {
  id: string
  taxType: string
  value: string
}

export const taxIdInputSchema = z.object({
  taxType: z.string().min(1).max(64),
  value: z.string().trim().min(1, "Tax ID value is required").max(100),
})

export const setAccountTaxIdsSchema = z.object({
  taxIds: z.array(taxIdInputSchema).max(50),
})

export type TaxIdInput = z.input<typeof taxIdInputSchema>

// The active tax-type registry (drives the country -> type mapping + per-type
// format validation on the account form). Readable by all authenticated users.
export async function getTaxIdTypes(
  ctx: AccountTaxIdsCallContext,
): Promise<TaxIdType[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("tax_id_types")
    .select("code, label, country_iso, format_regex, display_order")
    .eq("active", true)
    .order("country_iso", { ascending: true })
    .order("display_order", { ascending: true })

  if (error) {
    throw new Error(`Failed to load tax id types: ${error.message}`)
  }

  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>
    return {
      code: row.code as string,
      label: row.label as string,
      countryIso: row.country_iso as string,
      formatRegex: (row.format_regex as string) ?? null,
      displayOrder: (row.display_order as number) ?? 0,
    }
  })
}

// An account's tax IDs. RLS scopes the read to accounts the caller can see.
export async function getTaxIdsForAccount(
  ctx: AccountTaxIdsCallContext,
  accountId: string,
): Promise<AccountTaxId[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("account_tax_ids")
    .select("id, tax_type, value")
    .eq("account_id", accountId)
    .order("tax_type", { ascending: true })

  if (error) {
    throw new Error(`Failed to load account tax ids: ${error.message}`)
  }

  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>
    return {
      id: row.id as string,
      taxType: row.tax_type as string,
      value: row.value as string,
    }
  })
}

// Replaces the account's tax IDs with the supplied set (delete-then-insert).
// RLS enforces that the caller may write the parent account; duplicates within
// the payload are collapsed (the UNIQUE constraint would otherwise reject them).
export async function setTaxIdsForAccount(
  ctx: AccountTaxIdsCallContext,
  accountId: string,
  input: z.input<typeof setAccountTaxIdsSchema>,
): Promise<void> {
  const { taxIds } = setAccountTaxIdsSchema.parse(input)
  const supabase = await createServerClient()

  const { error: deleteError } = await supabase
    .from("account_tax_ids")
    .delete()
    .eq("account_id", accountId)

  if (deleteError) {
    throw new Error(`Failed to update tax ids: ${deleteError.message}`)
  }

  if (taxIds.length === 0) return

  // Collapse exact duplicates from the payload.
  const seen = new Set<string>()
  const rows = taxIds
    .filter((t) => {
      const key = `${t.taxType}::${t.value.trim()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((t) => ({
      account_id: accountId,
      tax_type: t.taxType,
      value: t.value.trim(),
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    }))

  const { error: insertError } = await supabase
    .from("account_tax_ids")
    .insert(rows as never)

  if (insertError) {
    throw new Error(`Failed to save tax ids: ${insertError.message}`)
  }
}
