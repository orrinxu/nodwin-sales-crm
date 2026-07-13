import "server-only"
import { cache } from "react"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface UserPreferencesCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export type NumberFormat = "international" | "indian"
export type DateFormat = "iso" | "us" | "international"
export type ThemePreference = "light" | "dark" | "system"

export interface UserPreferencesRecord {
  // null display_currency => fall back to the org reporting currency.
  displayCurrency: string | null
  // null entry_currency_default => "match display" on the new-deal form.
  entryCurrencyDefault: string | null
  timezone: string | null
  numberFormat: NumberFormat
  dateFormat: DateFormat
  theme: ThemePreference
  jobTitle: string | null
}

export const DEFAULT_USER_PREFERENCES: UserPreferencesRecord = {
  displayCurrency: null,
  entryCurrencyDefault: null,
  timezone: null,
  numberFormat: "international",
  dateFormat: "iso",
  theme: "system",
  jobTitle: null,
}

const currencyCode = z
  .string()
  .regex(/^[A-Z0-9]{1,8}$/, "Invalid currency code")
  .nullable()
  .optional()

export const userPreferencesUpdateSchema = z.object({
  displayCurrency: currencyCode,
  entryCurrencyDefault: currencyCode,
  timezone: z.string().max(64).nullable().optional(),
  numberFormat: z.enum(["international", "indian"]).optional(),
  dateFormat: z.enum(["iso", "us", "international"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  jobTitle: z.string().max(200).nullable().optional().or(z.literal("")),
})

export type UserPreferencesUpdateInput = z.input<typeof userPreferencesUpdateSchema>

function toDomain(data: Record<string, unknown>): UserPreferencesRecord {
  return {
    displayCurrency: (data.display_currency as string) ?? null,
    entryCurrencyDefault: (data.entry_currency_default as string) ?? null,
    timezone: (data.timezone as string) ?? null,
    numberFormat: (data.number_format as NumberFormat) ?? "international",
    dateFormat: (data.date_format as DateFormat) ?? "iso",
    theme: (data.theme as ThemePreference) ?? "system",
    jobTitle: (data.job_title as string) ?? null,
  }
}

function toDb(input: z.infer<typeof userPreferencesUpdateSchema>): Record<string, unknown> {
  const db: Record<string, unknown> = {}
  if ("displayCurrency" in input) db.display_currency = input.displayCurrency || null
  if ("entryCurrencyDefault" in input) db.entry_currency_default = input.entryCurrencyDefault || null
  if ("timezone" in input) db.timezone = input.timezone || null
  if ("numberFormat" in input && input.numberFormat !== undefined) db.number_format = input.numberFormat
  if ("dateFormat" in input && input.dateFormat !== undefined) db.date_format = input.dateFormat
  if ("theme" in input && input.theme !== undefined) db.theme = input.theme
  if ("jobTitle" in input) db.job_title = input.jobTitle || null
  return db
}

export interface CurrencyOption {
  code: string
  name: string
}

// Active currencies for the settings selects. Sourced from the currencies
// table (the same registry convert.ts / metrics.ts read), not a hardcoded list.
export async function getCurrencyOptions(
  ctx: UserPreferencesCallContext,
): Promise<CurrencyOption[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("currencies")
    .select("code, name")
    .eq("active", true)
    .order("code", { ascending: true })

  if (error) {
    throw new Error(`Failed to load currencies: ${error.message}`)
  }

  return (data ?? []).map((r) => ({
    code: (r as Record<string, unknown>).code as string,
    name: (r as Record<string, unknown>).name as string,
  }))
}

// Single source of truth for the caller's preferences row, memoized per request
// with React cache() keyed on user id. The (crm) layout reads preferences once,
// and pages (e.g. the dashboard) previously issued 2-3 more single-column reads
// of the SAME one row (getDisplayCurrency/getNumberFormat/getDateFormat). Sharing
// one cached `select *` collapses those into a single round-trip per request.
// cache() is per-request scoped (same pattern as auth.getMyPermissions), so there
// is no cross-user leakage: a different user is a different request scope.
const loadPreferencesRow = cache(
  async (userId: string): Promise<UserPreferencesRecord> => {
    const supabase = await createServerClient()

    const { data, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to load preferences: ${error.message}`)
    }

    if (!data) return { ...DEFAULT_USER_PREFERENCES }
    return toDomain(data as Record<string, unknown>)
  },
)

// Returns the current user's preferences, or defaults if they have no row yet.
// RLS (user_preferences_select_own_or_admin) scopes the read to the caller.
export async function getUserPreferences(
  ctx: UserPreferencesCallContext,
): Promise<UserPreferencesRecord> {
  return loadPreferencesRow(ctx.user.id)
}

// Resolves just the display currency (used by the dashboards/reports rollup
// path); null means "use the org default". Derived from the shared cached row.
export async function getDisplayCurrency(
  ctx: UserPreferencesCallContext,
): Promise<string | null> {
  return (await loadPreferencesRow(ctx.user.id)).displayCurrency
}

// Resolves just the number-format preference (used by the dashboard number
// formatters); defaults to "international". Derived from the shared cached row.
export async function getNumberFormat(
  ctx: UserPreferencesCallContext,
): Promise<NumberFormat> {
  return (await loadPreferencesRow(ctx.user.id)).numberFormat
}

// Resolves just the date-format preference (used by the dashboard date
// formatters); defaults to "iso". Derived from the shared cached row.
export async function getDateFormat(
  ctx: UserPreferencesCallContext,
): Promise<DateFormat> {
  return (await loadPreferencesRow(ctx.user.id)).dateFormat
}

// Upserts the caller's preferences row (keyed on user_id). Only the provided
// fields are changed. RLS + the audit trigger enforce ownership and stamps.
export async function upsertUserPreferences(
  ctx: UserPreferencesCallContext,
  input: UserPreferencesUpdateInput,
): Promise<UserPreferencesRecord> {
  const parsed = userPreferencesUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const payload = {
    user_id: ctx.user.id,
    updated_by: ctx.user.id,
    ...toDb(parsed),
  }

  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(payload as never, { onConflict: "user_id" })
    .select("*")
    .single()

  if (error) {
    throw new Error(`Failed to save preferences: ${error.message}`)
  }

  return toDomain(data as Record<string, unknown>)
}
