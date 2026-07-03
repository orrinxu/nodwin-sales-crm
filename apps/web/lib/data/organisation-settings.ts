import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface OrgSettingsCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

// Ultimate fallback when no group-wide or per-entity reporting currency is set.
export const DEFAULT_REPORTING_CURRENCY = "USD"

export interface EntityReportingCurrency {
  entityId: string
  entityName: string | null
  currencyCode: string
}

export interface ReportingCurrencyOverview {
  // null => no group-wide row; the app falls back to DEFAULT_REPORTING_CURRENCY.
  groupDefault: string | null
  entityOverrides: EntityReportingCurrency[]
}

const currencyCode = z.string().regex(/^[A-Z0-9]{1,8}$/, "Invalid currency code")

export const groupReportingCurrencySchema = z.object({
  // null clears the group-wide default (falls back to USD).
  currencyCode: currencyCode.nullable(),
})

export const entityReportingCurrencySchema = z.object({
  entityId: z.string().uuid(),
  currencyCode,
})

// ── Reads ───────────────────────────────────────────────────────────────────

// Full picture for the admin UI: the group-wide default + every per-entity
// override (with entity name). RLS allows all authenticated to read.
export async function getReportingCurrencyOverview(
  ctx: OrgSettingsCallContext,
): Promise<ReportingCurrencyOverview> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("reporting_currency_settings")
    .select("entity_id, currency_code, entity:entity_id ( name )")

  if (error) {
    throw new Error(`Failed to load reporting currency settings: ${error.message}`)
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  const groupRow = rows.find((r) => r.entity_id === null)
  const entityOverrides = rows
    .filter((r) => r.entity_id !== null)
    .map((r) => {
      const entity = r.entity as { name: string } | null
      return {
        entityId: r.entity_id as string,
        entityName: entity?.name ?? null,
        currencyCode: r.currency_code as string,
      }
    })
    .sort((a, b) => (a.entityName ?? "").localeCompare(b.entityName ?? ""))

  return {
    groupDefault: (groupRow?.currency_code as string) ?? null,
    entityOverrides,
  }
}

// The reporting currency for a given entity: the entity's override if present,
// otherwise the group-wide default, otherwise USD. This is the org-level half of
// the two-tier resolution (the per-user display_currency layers on top of it in
// metrics.ts::resolveReportingCurrency).
export async function resolveOrgReportingCurrency(
  ctx: OrgSettingsCallContext,
): Promise<string> {
  const supabase = await createServerClient()

  // The viewer's entity (used to pick a per-entity override).
  const { data: userRow } = await supabase
    .from("users")
    .select("primary_entity_id")
    .eq("id", ctx.user.id)
    .maybeSingle()

  const entityId = (userRow?.primary_entity_id as string) ?? null

  if (entityId) {
    const { data: override } = await supabase
      .from("reporting_currency_settings")
      .select("currency_code")
      .eq("entity_id", entityId)
      .maybeSingle()
    if (override?.currency_code) return override.currency_code as string
  }

  const { data: group } = await supabase
    .from("reporting_currency_settings")
    .select("currency_code")
    .is("entity_id", null)
    .maybeSingle()

  return (group?.currency_code as string) ?? DEFAULT_REPORTING_CURRENCY
}

// ── Writes (Super Admin only via RLS; entity-scoped writes land in a later ticket) ──

// Manual upsert of the single group-wide row (entity_id IS NULL). A partial
// unique index guarantees at most one such row; onConflict can't target a
// partial index cleanly, so select-then-write.
export async function setGroupReportingCurrency(
  ctx: OrgSettingsCallContext,
  input: z.input<typeof groupReportingCurrencySchema>,
): Promise<void> {
  const { currencyCode } = groupReportingCurrencySchema.parse(input)
  const supabase = await createServerClient()

  const { data: existing } = await supabase
    .from("reporting_currency_settings")
    .select("id")
    .is("entity_id", null)
    .maybeSingle()

  // null clears the group default.
  if (currencyCode === null) {
    if (existing) {
      const { error } = await supabase
        .from("reporting_currency_settings")
        .delete()
        .eq("id", existing.id as string)
      if (error) throw new Error(`Failed to clear group reporting currency: ${error.message}`)
    }
    return
  }

  if (existing) {
    const { error } = await supabase
      .from("reporting_currency_settings")
      .update({ currency_code: currencyCode, is_default: true } as never)
      .eq("id", existing.id as string)
    if (error) throw new Error(`Failed to update group reporting currency: ${error.message}`)
  } else {
    const { error } = await supabase
      .from("reporting_currency_settings")
      .insert({ entity_id: null, currency_code: currencyCode, is_default: true } as never)
    if (error) throw new Error(`Failed to set group reporting currency: ${error.message}`)
  }
}

export async function setEntityReportingCurrency(
  ctx: OrgSettingsCallContext,
  input: z.input<typeof entityReportingCurrencySchema>,
): Promise<void> {
  const { entityId, currencyCode } = entityReportingCurrencySchema.parse(input)
  const supabase = await createServerClient()

  const { data: existing } = await supabase
    .from("reporting_currency_settings")
    .select("id")
    .eq("entity_id", entityId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from("reporting_currency_settings")
      .update({ currency_code: currencyCode } as never)
      .eq("id", existing.id as string)
    if (error) throw new Error(`Failed to update entity reporting currency: ${error.message}`)
  } else {
    const { error } = await supabase
      .from("reporting_currency_settings")
      .insert({ entity_id: entityId, currency_code: currencyCode, is_default: false } as never)
    if (error) throw new Error(`Failed to set entity reporting currency: ${error.message}`)
  }
}

export async function removeEntityReportingCurrency(
  ctx: OrgSettingsCallContext,
  entityId: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("reporting_currency_settings")
    .delete()
    .eq("entity_id", entityId)
  if (error) throw new Error(`Failed to remove entity reporting currency: ${error.message}`)
}
