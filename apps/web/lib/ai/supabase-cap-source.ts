import "server-only"
import type { CapDataSource, DailyUsage } from "./types"
import { Money } from "../money"
import { createServerClient } from "../supabase/server"

function parseMoneyAmount(val: unknown): Money {
  if (val == null) return Money.zero("USD")
  const num = Number(val)
  return isNaN(num) ? Money.zero("USD") : Money.fromAmount(num, "USD")
}

export function createSupabaseCapDataSource(): CapDataSource {
  return {
    async getUserDailyUsage(userId: string): Promise<DailyUsage> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .rpc("get_todays_user_usage", { p_user_id: userId })
        .single()

      if (error || !data) {
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

      if (error || !data) {
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

      if (error || !data) {
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

      if (error || !data) {
        return { userSoftCap: null, userHardCap: null }
      }

      const row = data as Record<string, unknown>
      const rawSoft = row.soft_cap_amount
      const rawHard = row.hard_cap_amount
      return {
        userSoftCap: rawSoft != null ? Money.fromAmount(Number(rawSoft), "USD") : null,
        userHardCap: rawHard != null ? Money.fromAmount(Number(rawHard), "USD") : null,
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

      if (error || !data) {
        return null
      }

      const rec = data as Record<string, unknown>
      const amount = rec.hard_cap_amount
      const currency = (rec.hard_cap_currency as string) ?? "USD"
      return amount != null ? Money.fromAmount(Number(amount), currency) : null
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

      if (error || !data) {
        return null
      }

      const rec = data as Record<string, unknown>
      const amount = rec.hard_cap_amount
      const currency = (rec.hard_cap_currency as string) ?? "USD"
      return amount != null ? Money.fromAmount(Number(amount), currency) : null
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
