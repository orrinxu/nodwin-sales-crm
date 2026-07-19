import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const { state } = vi.hoisted(() => ({
  state: { rpc: { data: null as unknown, error: null as unknown } },
}))

// Minimal Supabase stub: rpc(...).single() resolves the configured result.
vi.mock("../supabase/server", () => ({
  createServerClient: async () => ({
    rpc: () => ({ single: async () => state.rpc }),
  }),
}))

import { createSupabaseCapDataSource } from "./supabase-cap-source"

describe("createSupabaseCapDataSource — getUserDailyUsage fail-closed (ORR-807f)", () => {
  beforeEach(() => {
    state.rpc = { data: null, error: null }
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("THROWS on a genuine read error instead of silently returning zero usage", async () => {
    // The old behavior returned zero here — which bypasses the hard cap exactly
    // when the usage query is broken. It must now fail closed (throw), so the
    // router denies the call rather than spend unbounded.
    state.rpc = { data: null, error: { message: "connection reset" } }
    const source = createSupabaseCapDataSource()
    await expect(source.getUserDailyUsage("u1")).rejects.toThrow(/daily AI usage/i)
  })

  it("returns the parsed usage on success", async () => {
    state.rpc = {
      data: { total_cost_amount: "1.2500", total_prompt_tokens: 300, total_completion_tokens: 150, call_count: 4 },
      error: null,
    }
    const source = createSupabaseCapDataSource()
    const usage = await source.getUserDailyUsage("u1")
    expect(Number(usage.cost.toAmount())).toBeCloseTo(1.25, 4)
    expect(usage.callCount).toBe(4)
  })
})
