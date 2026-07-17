import "server-only"
import { cache } from "react"
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
// The viewer's primary entity. Request-memoized (ORR-765) — it was read once by
// resolveOrgReportingCurrency AND again by getCurrentUserEntityId, and the former
// runs ~9-20× per dashboard/reports render. cache() keys on the userId primitive
// so the many callers within one request share a single round-trip.
const loadUserPrimaryEntityId = cache(async (userId: string): Promise<string | null> => {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from("users")
    .select("primary_entity_id")
    .eq("id", userId)
    .maybeSingle()
  return (data?.primary_entity_id as string) ?? null
})

const loadOrgReportingCurrency = cache(async (userId: string): Promise<string> => {
  const supabase = await createServerClient()

  const entityId = await loadUserPrimaryEntityId(userId)

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
})

export async function resolveOrgReportingCurrency(
  ctx: OrgSettingsCallContext,
): Promise<string> {
  return loadOrgReportingCurrency(ctx.user.id)
}

// The caller's own entity (used to scope an Entity Admin's view to their entity).
export async function getCurrentUserEntityId(
  ctx: OrgSettingsCallContext,
): Promise<string | null> {
  return loadUserPrimaryEntityId(ctx.user.id)
}

// ── Writes: Super Admin any row (incl. group-wide); Entity Admin own entity only ──
// (enforced by reporting_currency_settings RLS — see 20260703210000). Group-wide
// mutations are additionally gated to Super Admin at the action layer.

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
