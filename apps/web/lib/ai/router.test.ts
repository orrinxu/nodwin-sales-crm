import { describe, it, expect, vi } from "vitest"

const { mockServerModule } = vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://test.supabase.co"
  process.env.SUPABASE_ANON_KEY = "test-anon-key"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
  process.env.POSTMARK_WEBHOOK_SECRET = "test-webhook-secret"
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000"
  return {
    mockServerModule: { createServerClient: vi.fn(), createServiceRoleClient: vi.fn() },
  }
})

vi.mock("../supabase/server", () => mockServerModule)

import { aiCall } from "./router"
import type { CapDataSource, ProviderAdapter, UsageLogger, InsertUsageParams, UsageRecord, AiCallParams } from "./types"
import { Money } from "../money"

function mockMoney(amount: number, currency = "USD"): Money {
  return Money.fromAmount(amount, currency)
}

function mockCapSource(overrides?: {
  userDailyUsage?: { cost: Money; totalPromptTokens: number; totalCompletionTokens: number; callCount: number }
  userCaps?: { userSoftCap: Money | null; userHardCap: Money | null }
  teamHardCap?: Money | null
  companyHardCap?: Money | null
  teamDailyUsage?: { cost: Money }
  companyDailyUsage?: { cost: Money }
  userTeamId?: string | null
  userEntityId?: string | null
}): CapDataSource {
  return {
    getUserDailyUsage: async () =>
      overrides?.userDailyUsage ?? { cost: Money.zero("USD"), totalPromptTokens: 0, totalCompletionTokens: 0, callCount: 0 },
    getTeamDailyUsage: async () =>
      overrides?.teamDailyUsage ?? { cost: Money.zero("USD") },
    getCompanyDailyUsage: async () =>
      overrides?.companyDailyUsage ?? { cost: Money.zero("USD") },
    getUserCapOverrides: async () =>
      overrides?.userCaps ?? { userSoftCap: null, userHardCap: null },
    getTeamHardCap: async () =>
      overrides?.teamHardCap ?? null,
    getCompanyHardCap: async () =>
      overrides?.companyHardCap ?? null,
    getUserTeamId: async () =>
      overrides?.userTeamId ?? null,
    getUserEntityId: async () =>
      overrides?.userEntityId ?? null,
  }
}

function mockLogger(): UsageLogger & { calls: InsertUsageParams[] } {
  const calls: InsertUsageParams[] = []
  return {
    calls,
    async log(params: InsertUsageParams): Promise<UsageRecord> {
      calls.push(params)
      return {
        id: "log-1",
        userId: params.userId,
        provider: params.provider,
        model: params.model,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        cost: params.cost,
        feature: params.feature,
        requestId: params.requestId,
        startedAt: params.startedAt.toISOString(),
        finishedAt: (params.finishedAt ?? new Date()).toISOString(),
        status: params.status ?? "success",
      }
    },
  }
}

const defaultParams: AiCallParams = {
  feature: "search",
  userId: "user-1",
  prompt: "test prompt",
  estimatedCost: Money.fromCents(10, "USD"),
  estimatePromptTokens: 100,
  estimateCompletionTokens: 50,
  requestId: "req-1",
}

function stubAdapter(text = "response"): ProviderAdapter {
  return {
    async call() {
      return { text, model: "test-model", promptTokens: 100, completionTokens: 50 }
    },
  }
}

describe("aiCall", () => {
  it("allows call when under all caps, calls adapter and logs usage", async () => {
    const logger = mockLogger()
    const result = await aiCall(
      { ...defaultParams },
      {
        adapters: new Map([["claude", stubAdapter("hello")]]),
        capSource: mockCapSource(),
        usageLogger: logger,
      },
    )

    expect(result.ok).toBe(true)
    expect(result.data).toBe("hello")
    expect(result.provider).toBe("claude")

    expect(logger.calls).toHaveLength(1)
    expect(logger.calls[0].status).toBe("success")
    expect(logger.calls[0].requestId).toBe("req-1")
  })

  it("returns service_unavailable when user hard cap would be exceeded", async () => {
    const logger = mockLogger()
    const adapter = stubAdapter()
    const adapterFn = vi.spyOn(adapter, "call")

    const result = await aiCall(
      { ...defaultParams, estimatedCost: mockMoney(0.50) },
      {
        adapters: new Map([["claude", adapter]]),
        capSource: mockCapSource({
          userDailyUsage: { cost: mockMoney(4.80), totalPromptTokens: 1000, totalCompletionTokens: 500, callCount: 8 },
          userCaps: { userSoftCap: mockMoney(3), userHardCap: mockMoney(5) },
        }),
        usageLogger: logger,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.reason).toBe("service_unavailable")

    expect(adapterFn).not.toHaveBeenCalled()

    expect(logger.calls).toHaveLength(1)
    expect(logger.calls[0].status).toBe("cap_rejected")
  })

  it("degrades to Ollama when soft cap is exceeded", async () => {
    const logger = mockLogger()
    const ollamaAdapter = stubAdapter("ollama response")

    const result = await aiCall(
      { ...defaultParams, estimatedCost: mockMoney(0.50) },
      {
        adapters: new Map([["ollama_local", ollamaAdapter]]),
        capSource: mockCapSource({
          userDailyUsage: { cost: mockMoney(3.50), totalPromptTokens: 1000, totalCompletionTokens: 500, callCount: 8 },
          userCaps: { userSoftCap: mockMoney(3), userHardCap: mockMoney(5) },
        }),
        usageLogger: logger,
      },
    )

    expect(result.ok).toBe(true)
    expect(result.data).toBe("ollama response")
    expect(result.provider).toBe("ollama_local")

    expect(logger.calls).toHaveLength(1)
    expect(logger.calls[0].status).toBe("fallback")
  })

  it("falls back in map insertion order when the first provider throws", async () => {
    const failing: ProviderAdapter = { async call() { throw new Error("boom") } }
    const logger = mockLogger()
    // Insertion order = intended fallback order (ORR-635 DB chain: primary first).
    const result = await aiCall(
      { ...defaultParams },
      {
        adapters: new Map<string, ProviderAdapter>([
          ["gemini", failing],
          ["claude", stubAdapter("second")],
        ]),
        capSource: mockCapSource(),
        usageLogger: logger,
      },
    )

    expect(result.ok).toBe(true)
    expect(result.data).toBe("second")
    expect(result.provider).toBe("claude")
    // ORR-807d: the failed first attempt is now logged too (was invisible before).
    expect(logger.calls).toHaveLength(2)
    expect(logger.calls[0].provider).toBe("gemini")
    expect(logger.calls[0].status).toBe("error")
    expect(logger.calls[1].provider).toBe("claude")
    expect(logger.calls[1].status).toBe("success")
  })

  it("returns service_unavailable on hard cap even with adapters available", async () => {
    const result = await aiCall(
      { ...defaultParams, estimatedCost: mockMoney(1.00) },
      {
        adapters: new Map([["claude", stubAdapter()]]),
        capSource: mockCapSource({
          userDailyUsage: { cost: mockMoney(5.00), totalPromptTokens: 1000, totalCompletionTokens: 500, callCount: 8 },
          userCaps: { userSoftCap: mockMoney(3), userHardCap: mockMoney(5) },
        }),
      },
    )

    expect(result.ok).toBe(false)
    expect(result.reason).toBe("service_unavailable")
  })

  it("does NOT degrade a zero-cost call — self-hosted RAG stays on its own chain (ORR-807c)", async () => {
    const logger = mockLogger()
    // Soft cap breached ($3.50 > $3) but the call is free and the chain has NO
    // ollama_local adapter (RAG hands the router only openai_compatible). The
    // old code degraded → empty chain → provider_error. Now it must proceed.
    const result = await aiCall(
      { ...defaultParams, estimatedCost: Money.zero("USD") },
      {
        adapters: new Map([["openai_compatible", stubAdapter("rag answer")]]),
        capSource: mockCapSource({
          userDailyUsage: { cost: mockMoney(3.50), totalPromptTokens: 0, totalCompletionTokens: 0, callCount: 8 },
          userCaps: { userSoftCap: mockMoney(3), userHardCap: mockMoney(5) },
        }),
        usageLogger: logger,
      },
    )

    expect(result.ok).toBe(true)
    expect(result.data).toBe("rag answer")
    expect(result.provider).toBe("openai_compatible")
    expect(logger.calls[0].status).toBe("success") // not "fallback", not degraded
  })

  it("soft-cap degrade with no ollama_local adapter falls back to the chain, not an outage (ORR-807c)", async () => {
    const logger = mockLogger()
    const result = await aiCall(
      { ...defaultParams, estimatedCost: mockMoney(0.02) },
      {
        adapters: new Map([["claude", stubAdapter("claude answer")]]),
        capSource: mockCapSource({
          userDailyUsage: { cost: mockMoney(3.50), totalPromptTokens: 0, totalCompletionTokens: 0, callCount: 8 },
          userCaps: { userSoftCap: mockMoney(3), userHardCap: mockMoney(5) },
        }),
        usageLogger: logger,
      },
    )

    expect(result.ok).toBe(true)
    expect(result.provider).toBe("claude")
    // still operating under a soft-cap breach → logged as fallback, but served
    expect(logger.calls[0].status).toBe("fallback")
  })

  it("keeps a good completion even if the success usage-log insert throws (ORR-807d)", async () => {
    const throwingLogger: UsageLogger = {
      async log(): Promise<UsageRecord> { throw new Error("insert hiccup") },
    }
    const second = stubAdapter("second")
    const secondSpy = vi.spyOn(second, "call")

    const result = await aiCall(
      { ...defaultParams },
      {
        adapters: new Map<string, ProviderAdapter>([
          ["claude", stubAdapter("first")],
          ["gemini", second],
        ]),
        capSource: mockCapSource(),
        usageLogger: throwingLogger,
      },
    )

    // A logging failure must NOT discard the completion or fall through to B.
    expect(result.ok).toBe(true)
    expect(result.data).toBe("first")
    expect(result.provider).toBe("claude")
    expect(secondSpy).not.toHaveBeenCalled()
  })

  it("logs a failed provider attempt before falling through (ORR-807d)", async () => {
    const failing: ProviderAdapter = { async call() { throw new Error("boom") } }
    const logger = mockLogger()

    const result = await aiCall(
      { ...defaultParams },
      {
        adapters: new Map<string, ProviderAdapter>([
          ["gemini", failing],
          ["claude", stubAdapter("ok")],
        ]),
        capSource: mockCapSource(),
        usageLogger: logger,
      },
    )

    expect(result.ok).toBe(true)
    const gem = logger.calls.find((c) => c.provider === "gemini")
    expect(gem?.status).toBe("error") // the failed attempt is now visible
    expect(logger.calls.find((c) => c.provider === "claude")?.status).toBe("success")
  })

  it("fails CLOSED when the cap source throws — does not bypass caps (ORR-807f)", async () => {
    const source = mockCapSource()
    source.getUserDailyUsage = async () => { throw new Error("usage query down") }
    const adapter = stubAdapter()
    const spy = vi.spyOn(adapter, "call")

    const result = await aiCall(
      { ...defaultParams },
      { adapters: new Map([["claude", adapter]]), capSource: source },
    )

    expect(result.ok).toBe(false)
    expect(result.reason).toBe("service_unavailable")
    expect(spy).not.toHaveBeenCalled() // never spent under an unknown-usage state
  })

  it("returns provider_error when no adapters match", async () => {
    const result = await aiCall(
      { ...defaultParams },
      {
        adapters: new Map(),
        capSource: mockCapSource(),
      },
    )

    expect(result.ok).toBe(false)
    expect(result.reason).toBe("provider_error")
  })

  it("rejects 11th call when $1 daily hard cap is set ($0.10/call)", async () => {
    let cumulativeCents = 0

    const dataSource: CapDataSource = {
      getUserDailyUsage: async () => ({
        cost: Money.fromCents(cumulativeCents, "USD"),
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        callCount: Math.floor(cumulativeCents / 10),
      }),
      getTeamDailyUsage: async () => ({ cost: Money.zero("USD") }),
      getCompanyDailyUsage: async () => ({ cost: Money.zero("USD") }),
      getUserCapOverrides: async () => ({ userSoftCap: null, userHardCap: Money.fromCents(100, "USD") }),
      getTeamHardCap: async () => null,
      getCompanyHardCap: async () => null,
      getUserTeamId: async () => null,
      getUserEntityId: async () => null,
    }

    const logger = mockLogger()

    for (let i = 0; i < 10; i++) {
      const result = await aiCall(
        { ...defaultParams, estimatedCost: Money.fromCents(10, "USD"), requestId: `req-${i}` },
        {
          adapters: new Map([["claude", stubAdapter(`call-${i}`)]]),
          capSource: dataSource,
          usageLogger: logger,
        },
      )
      expect(result.ok).toBe(true)
      expect(result.data).toBe(`call-${i}`)
      cumulativeCents += 10
    }

    const result = await aiCall(
      { ...defaultParams, estimatedCost: Money.fromCents(10, "USD"), requestId: "req-11" },
      {
        adapters: new Map([["claude", stubAdapter("should-not-be-called")]]),
        capSource: dataSource,
        usageLogger: logger,
      },
    )

    expect(result.ok).toBe(false)
    expect(result.reason).toBe("service_unavailable")
  })
})
