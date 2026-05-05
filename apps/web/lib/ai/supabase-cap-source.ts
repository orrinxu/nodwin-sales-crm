import "server-only"
import type { CapDataSource, DailyUsage } from "./types"
import { createServerClient } from "../supabase/server"

export function createSupabaseCapDataSource(): CapDataSource {
  return {
    async getUserDailyUsage(userId: string): Promise<DailyUsage> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .rpc("get_todays_user_usage", { p_user_id: userId })
        .single()

      if (error || !data) {
        return { totalCostUsd: 0, totalPromptTokens: 0, totalCompletionTokens: 0, callCount: 0 }
      }

      const row = data as Record<string, unknown>
      const costVal = row.total_cost_usd
      return {
        totalCostUsd: typeof costVal === "number" ? costVal : 0,
        totalPromptTokens: Number(row.total_prompt_tokens ?? 0),
        totalCompletionTokens: Number(row.total_completion_tokens ?? 0),
        callCount: Number(row.call_count ?? 0),
      }
    },

    async getTeamDailyUsage(teamId: string): Promise<{ totalCostUsd: number }> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .rpc("get_todays_team_usage", { p_team_id: teamId })
        .single()

      if (error || !data) {
        return { totalCostUsd: 0 }
      }

      const row = data as Record<string, unknown>
      const val = row.total_cost_usd
      const totalCostUsd = typeof val === "number" ? val : 0
      return { totalCostUsd }
    },

    async getCompanyDailyUsage(entityId: string): Promise<{ totalCostUsd: number }> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .rpc("get_todays_company_usage", { p_entity_id: entityId })
        .single()

      if (error || !data) {
        return { totalCostUsd: 0 }
      }

      const row = data as Record<string, unknown>
      const val = row.total_cost_usd
      const totalCostUsd = typeof val === "number" ? val : 0
      return { totalCostUsd }
    },

    async getUserCapOverrides(userId: string): Promise<{
      userSoftCapUsd: number | null
      userHardCapUsd: number | null
    }> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .rpc("get_effective_user_caps", { p_user_id: userId })
        .single()

      if (error || !data) {
        return { userSoftCapUsd: null, userHardCapUsd: null }
      }

      const row = data as Record<string, unknown>
      const rawSoft = row.soft_cap_usd
      const rawHard = row.hard_cap_usd
      return {
        userSoftCapUsd: rawSoft != null ? (rawSoft as number) : null,
        userHardCapUsd: rawHard != null ? (rawHard as number) : null,
      }
    },

    async getTeamHardCap(teamId: string): Promise<number | null> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .from("ai_daily_caps")
        .select("hard_cap_usd")
        .eq("scope_kind", "team")
        .eq("scope_id", teamId)
        .eq("active", true)
        .maybeSingle()

      if (error || !data) {
        return null
      }

      const rec = data as Record<string, unknown>
      return (rec.hard_cap_usd as number) ?? null
    },

    async getCompanyHardCap(entityId: string): Promise<number | null> {
      const supabase = await createServerClient()
      const { data, error } = await supabase
        .from("ai_daily_caps")
        .select("hard_cap_usd")
        .eq("scope_kind", "company")
        .eq("scope_id", entityId)
        .eq("active", true)
        .maybeSingle()

      if (error || !data) {
        return null
      }

      const rec = data as Record<string, unknown>
      return (rec.hard_cap_usd as number) ?? null
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
