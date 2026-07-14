import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mockRpc = vi.fn((fn: string, _params?: unknown) => {
  switch (fn) {
    case "ai_usage_totals":
      return Promise.resolve({ data: [{ cost: 12.5, calls: 3, prompt_tokens: 100, completion_tokens: 50 }], error: null })
    case "ai_usage_daily_cost":
      return Promise.resolve({ data: [{ usage_date: "2026-07-14", cost: 12.5, calls: 3 }], error: null })
    case "ai_usage_by_provider":
      return Promise.resolve({ data: [{ provider: "claude", cost: 10, calls: 2 }], error: null })
    case "ai_usage_by_feature":
      return Promise.resolve({ data: [{ feature: "opportunity_extraction", cost: 12.5, calls: 3 }], error: null })
    default:
      return Promise.resolve({ data: [], error: null })
  }
})

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ rpc: mockRpc })),
}))

import { getAiUsageOverview } from "./ai-usage"

const ctx = { user: { id: "admin-1", email: "a@nodwin.com", role: "admin" }, source: "web" as const }

describe("getAiUsageOverview", () => {
  it("maps totals, daily series and dimension breakdowns", async () => {
    const o = await getAiUsageOverview(ctx)
    expect(o.totals).toEqual({ cost: 12.5, calls: 3, promptTokens: 100, completionTokens: 50 })
    expect(o.daily).toEqual([{ date: "2026-07-14", cost: 12.5, calls: 3 }])
    expect(o.byProvider).toEqual([{ key: "claude", cost: 10, calls: 2 }])
    expect(o.byFeature).toEqual([{ key: "opportunity_extraction", cost: 12.5, calls: 3 }])
    expect(o.currency).toBe("USD")
  })

  it("defaults to a 30-day window and clamps invalid windows", async () => {
    expect((await getAiUsageOverview(ctx)).windowDays).toBe(30)
    expect((await getAiUsageOverview(ctx, { days: 999 })).windowDays).toBe(30)
  })

  it("accepts the supported windows", async () => {
    expect((await getAiUsageOverview(ctx, { days: 7 })).windowDays).toBe(7)
    expect((await getAiUsageOverview(ctx, { days: 90 })).windowDays).toBe(90)
  })

  it("passes an ISO from/to date window to the RPCs", async () => {
    await getAiUsageOverview(ctx, { days: 7 })
    const call = mockRpc.mock.calls.find((c) => c[0] === "ai_usage_totals")!
    const args = call[1] as { p_from: string; p_to: string }
    expect(args.p_from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(args.p_to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(args.p_from <= args.p_to).toBe(true)
  })
})
