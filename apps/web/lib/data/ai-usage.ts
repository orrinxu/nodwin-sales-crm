import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

// ORR-701 — read path for the admin AI cost/usage dashboard. ai_usage is logged
// write-only; these totals come from the SECURITY INVOKER aggregate functions
// (migration 20260714060000), so ai_usage RLS still applies — the admin-gated page
// gets company-wide numbers. Costs are in USD (the usage logger records USD).

export interface AiUsageCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface AiUsageTotals {
  cost: number
  calls: number
  promptTokens: number
  completionTokens: number
}

export interface AiUsageDailyPoint {
  date: string
  cost: number
  calls: number
}

export interface AiUsageDimension {
  key: string
  cost: number
  calls: number
}

export interface AiUsageOverview {
  totals: AiUsageTotals
  daily: AiUsageDailyPoint[]
  byProvider: AiUsageDimension[]
  byFeature: AiUsageDimension[]
  currency: string
  windowDays: number
  from: string
  to: string
}

export const AI_USAGE_WINDOWS = [7, 30, 90] as const
export type AiUsageWindow = (typeof AI_USAGE_WINDOWS)[number]

function resolveWindow(days: number | undefined): AiUsageWindow {
  return (AI_USAGE_WINDOWS as readonly number[]).includes(days ?? 0) ? (days as AiUsageWindow) : 30
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getAiUsageOverview(
  _ctx: AiUsageCallContext,
  opts: { days?: number } = {},
): Promise<AiUsageOverview> {
  const windowDays = resolveWindow(opts.days)
  const supabase = await createServerClient()

  const to = new Date()
  const from = new Date(to.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000)
  const p_from = isoDate(from)
  const p_to = isoDate(to)

  const [totalsRes, dailyRes, providerRes, featureRes] = await Promise.all([
    supabase.rpc("ai_usage_totals", { p_from, p_to }),
    supabase.rpc("ai_usage_daily_cost", { p_from, p_to }),
    supabase.rpc("ai_usage_by_provider", { p_from, p_to }),
    supabase.rpc("ai_usage_by_feature", { p_from, p_to }),
  ])
  for (const r of [totalsRes, dailyRes, providerRes, featureRes]) {
    if (r.error) throw new Error(`Failed to load AI usage: ${r.error.message}`)
  }

  const t = (totalsRes.data?.[0] ?? {}) as {
    cost?: number | string; calls?: number | string
    prompt_tokens?: number | string; completion_tokens?: number | string
  }

  return {
    totals: {
      cost: Number(t.cost ?? 0),
      calls: Number(t.calls ?? 0),
      promptTokens: Number(t.prompt_tokens ?? 0),
      completionTokens: Number(t.completion_tokens ?? 0),
    },
    daily: ((dailyRes.data ?? []) as { usage_date: string; cost: number | string; calls: number | string }[])
      .map((d) => ({ date: d.usage_date, cost: Number(d.cost), calls: Number(d.calls) })),
    byProvider: ((providerRes.data ?? []) as { provider: string; cost: number | string; calls: number | string }[])
      .map((d) => ({ key: d.provider, cost: Number(d.cost), calls: Number(d.calls) })),
    byFeature: ((featureRes.data ?? []) as { feature: string; cost: number | string; calls: number | string }[])
      .map((d) => ({ key: d.feature, cost: Number(d.cost), calls: Number(d.calls) })),
    currency: "USD",
    windowDays,
    from: p_from,
    to: p_to,
  }
}
