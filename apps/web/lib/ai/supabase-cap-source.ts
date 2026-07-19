import "server-only"
import type { CapDataSource, DailyUsage } from "./types"
import { Money } from "../money"
import { createServerClient } from "../supabase/server"

function parseMoneyAmount(val: unknown): Money {
  if (val == null) return Money.zero("USD")
  if (typeof val === "string") return Money.fromAmount(val, "USD")
  if (typeof val === "number" && !isNaN(val)) return Money.fromAmount(val, "USD")
  return Money.zero("USD")
}

export function createSupabaseCapDataSource(): CapDataSource {
  return {
    async getUserDailyUsage(userId: string): Promise<DailyUsage> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .rpc("get_todays_user_usage", { p_user_id: userId })
        .single()

      // Fail CLOSED (ORR-807f): this aggregate RPC always returns exactly one
      // row, so an error is a genuine read failure — not "no usage yet". Silently
      // returning zero here would let a hard cap be bypassed at the exact moment
      // the usage query is broken. Surface it so the router denies the call.
      if (error) {
        console.error("get_todays_user_usage failed — failing closed:", error)
        throw new Error(`Failed to read daily AI usage: ${error.message}`)
      }
      if (!data) {
        return { cost: Money.zero("USD"), totalPromptTokens: 0, totalCompletionTokens: 0, callCount: 0 }
      }

      const row = data as Record<string, unknown>
      return {
        cost: parseMoneyAmount(row.total_cost_amount),
        totalPromptTokens: Number(row.total_prompt_tokens ?? 0),
        totalCompletionTokens: Number(row.total_completion_tokens ?? 0),
        callCount: Number(row.call_count ?? 0),
      }
    },

    async getTeamDailyUsage(teamId: string): Promise<{ cost: Money }> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .rpc("get_todays_team_usage", { p_team_id: teamId })
        .single()

      // Fail closed (ORR-807f) — only reached when a team hard cap exists.
      if (error) {
        console.error("get_todays_team_usage failed — failing closed:", error)
        throw new Error(`Failed to read team AI usage: ${error.message}`)
      }
      if (!data) {
        return { cost: Money.zero("USD") }
      }

      const row = data as Record<string, unknown>
      return { cost: parseMoneyAmount(row.total_cost_amount) }
    },

    async getCompanyDailyUsage(entityId: string): Promise<{ cost: Money }> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .rpc("get_todays_company_usage", { p_entity_id: entityId })
        .single()

      // Fail closed (ORR-807f) — only reached when a company hard cap exists.
      if (error) {
        console.error("get_todays_company_usage failed — failing closed:", error)
        throw new Error(`Failed to read company AI usage: ${error.message}`)
      }
      if (!data) {
        return { cost: Money.zero("USD") }
      }

      const row = data as Record<string, unknown>
      return { cost: parseMoneyAmount(row.total_cost_amount) }
    },

    async getUserCapOverrides(userId: string): Promise<{
      userSoftCap: Money | null
      userHardCap: Money | null
    }> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .rpc("get_effective_user_caps", { p_user_id: userId })
        .single()

      // Log loudly (ORR-807f). Returning null here falls back to the
      // conservative built-in defaults (DEFAULT_USER_SOFT/HARD_CAP), which are
      // still enforced — so this read is not fail-open — but a broken caps query
      // must not be silent.
      if (error) {
        console.error("get_effective_user_caps failed — using default caps:", error)
      }
      if (error || !data) {
        return { userSoftCap: null, userHardCap: null }
      }

      const row = data as Record<string, unknown>
      const rawSoft = row.soft_cap_amount
      const rawHard = row.hard_cap_amount
      return {
        userSoftCap: rawSoft != null ? Money.fromAmount(rawSoft as string | number, "USD") : null,
        userHardCap: rawHard != null ? Money.fromAmount(rawHard as string | number, "USD") : null,
      }
    },

    async getTeamHardCap(teamId: string): Promise<Money | null> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .from("ai_daily_caps")
        .select("hard_cap_amount, hard_cap_currency")
        .eq("scope_kind", "team")
        .eq("scope_id", teamId)
        .eq("active", true)
        .maybeSingle()

      // maybeSingle() returns {data:null,error:null} for the common "no team cap
      // configured" case — that legitimately means no cap. A non-null error is a
      // genuine read failure: fail closed rather than skip the cap (ORR-807f).
      if (error) {
        console.error("Failed to read team hard cap — failing closed:", error)
        throw new Error(`Failed to read team hard cap: ${error.message}`)
      }
      if (!data) {
        return null
      }

      const rec = data as Record<string, unknown>
      const amount = rec.hard_cap_amount as string | number | null | undefined
      const currency = (rec.hard_cap_currency as string) ?? "USD"
      return amount != null ? Money.fromAmount(amount, currency) : null
    },

    async getCompanyHardCap(entityId: string): Promise<Money | null> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .from("ai_daily_caps")
        .select("hard_cap_amount, hard_cap_currency")
        .eq("scope_kind", "company")
        .eq("scope_id", entityId)
        .eq("active", true)
        .maybeSingle()

      // {data:null,error:null} = no company cap configured (legitimate). A
      // non-null error is a genuine read failure: fail closed (ORR-807f).
      if (error) {
        console.error("Failed to read company hard cap — failing closed:", error)
        throw new Error(`Failed to read company hard cap: ${error.message}`)
      }
      if (!data) {
        return null
      }

      const rec = data as Record<string, unknown>
      const amount = rec.hard_cap_amount as string | number | null | undefined
      const currency = (rec.hard_cap_currency as string) ?? "USD"
      return amount != null ? Money.fromAmount(amount, currency) : null
    },

    async getUserTeamId(userId: string): Promise<string | null> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .from("users")
        .select("primary_business_unit_id")
        .eq("id", userId)
        .maybeSingle()

      if (error || !data) {
        return null
      }

      return (data as Record<string, unknown>).primary_business_unit_id as string ?? null
    },

    async getUserEntityId(userId: string): Promise<string | null> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .from("users")
        .select("primary_entity_id")
        .eq("id", userId)
        .maybeSingle()

      if (error || !data) {
        return null
      }

      return (data as Record<string, unknown>).primary_entity_id as string ?? null
    },
  }
}
