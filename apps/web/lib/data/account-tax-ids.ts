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
// NOTE: returns ALL stored rows, including any whose tax_type has since been
// deactivated. The Ticket 3 form MUST render such rows (even though the type
// picker only lists active types) so a save doesn't silently drop them.
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

// Replaces the account's tax IDs with the supplied set. Delegates to the
// replace_account_tax_ids RPC, which does the delete + insert in ONE transaction
// (a two-call delete-then-insert risks wiping the account's tax IDs if the insert
// fails after the delete commits), authorises via can_write_account, and locks
// the account row for last-write-wins under concurrent saves. Dedupe of the
// payload is handled inside the RPC (ON CONFLICT DO NOTHING).
export async function setTaxIdsForAccount(
  ctx: AccountTaxIdsCallContext,
  accountId: string,
  input: z.input<typeof setAccountTaxIdsSchema>,
): Promise<void> {
  void ctx
  const { taxIds } = setAccountTaxIdsSchema.parse(input)
  const supabase = await createServerClient()

  const { error } = await supabase.rpc("replace_account_tax_ids", {
    _account_id: accountId,
    _tax_ids: taxIds.map((t) => ({ tax_type: t.taxType, value: t.value.trim() })),
  })

  if (error) {
    throw new Error(`Failed to save tax ids: ${error.message}`)
  }
}
