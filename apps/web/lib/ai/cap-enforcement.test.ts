import { describe, it, expect } from "vitest"
import { CapEnforcer } from "./cap-enforcement"
import type { DailyUsage } from "./types"
import { Money } from "../money"

function mockMoney(amount: number, currency = "USD"): Money {
  return Money.fromAmount(amount, currency)
}

function createMockDataSource(overrides?: {
  userDailyUsage?: DailyUsage
  teamDailyUsage?: { cost: Money }
  companyDailyUsage?: { cost: Money }
  userCapOverrides?: { userSoftCap: Money | null; userHardCap: Money | null }
  teamHardCap?: Money | null
  companyHardCap?: Money | null
  userTeamId?: string | null
  userEntityId?: string | null
}) {
  return {
    getUserDailyUsage: async (_userId: string): Promise<DailyUsage> =>
      overrides?.userDailyUsage ?? { cost: Money.zero("USD"), totalPromptTokens: 0, totalCompletionTokens: 0, callCount: 0 },

    getTeamDailyUsage: async (_teamId: string): Promise<{ cost: Money }> =>
      overrides?.teamDailyUsage ?? { cost: Money.zero("USD") },

    getCompanyDailyUsage: async (_entityId: string): Promise<{ cost: Money }> =>
      overrides?.companyDailyUsage ?? { cost: Money.zero("USD") },

    getUserCapOverrides: async (_userId: string) =>
      overrides?.userCapOverrides ?? { userSoftCap: null, userHardCap: null },

    getTeamHardCap: async (_teamId: string): Promise<Money | null> =>
      overrides?.teamHardCap ?? null,

    getCompanyHardCap: async (_entityId: string): Promise<Money | null> =>
      overrides?.companyHardCap ?? null,

    getUserTeamId: async (_userId: string): Promise<string | null> =>
      overrides?.userTeamId ?? null,

    getUserEntityId: async (_userId: string): Promise<string | null> =>
      overrides?.userEntityId ?? null,
  }
}

describe("CapEnforcer", () => {
  it("allows request when under all caps", async () => {
    const enforcer = new CapEnforcer(createMockDataSource(), mockMoney(3), mockMoney(5))
    const result = await enforcer.check("user-1", mockMoney(0.50))
    expect(result.allowed).toBe(true)
    expect(result.suggestedAction).toBe("proceed")
    expect(result.reason).toBeNull()
  })

  it("rejects request when user hard cap would be exceeded", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      userDailyUsage: { cost: mockMoney(4.80), totalPromptTokens: 1000, totalCompletionTokens: 500, callCount: 8 },
      userCapOverrides: { userSoftCap: mockMoney(3), userHardCap: mockMoney(5) },
    }), mockMoney(3), mockMoney(5))

    const result = await enforcer.check("user-1", mockMoney(0.50))
    expect(result.allowed).toBe(false)
    expect(result.suggestedAction).toBe("reject")
    expect(result.capScope).toBe("user")
    expect(result.reason).toContain("Per-user daily hard cap")
  })

  it("allows request when exactly at user hard cap", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      userDailyUsage: { cost: mockMoney(4.50), totalPromptTokens: 1000, totalCompletionTokens: 500, callCount: 8 },
      userCapOverrides: { userSoftCap: mockMoney(3), userHardCap: mockMoney(5) },
    }), mockMoney(3), mockMoney(5))

    const result = await enforcer.check("user-1", mockMoney(0.50))
    expect(result.allowed).toBe(true)
    expect(result.suggestedAction).toBe("degrade_to_ollama")
    expect(result.capScope).toBe("user")
  })

  it("degrades to Ollama when user soft cap is exceeded but hard cap is not", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      userDailyUsage: { cost: mockMoney(3.50), totalPromptTokens: 1000, totalCompletionTokens: 500, callCount: 8 },
      userCapOverrides: { userSoftCap: mockMoney(3), userHardCap: mockMoney(5) },
    }), mockMoney(3), mockMoney(5))

    const result = await enforcer.check("user-1", mockMoney(0.50))
    expect(result.allowed).toBe(true)
    expect(result.suggestedAction).toBe("degrade_to_ollama")
    expect(result.reason).toContain("Per-user daily soft cap")
  })

  it("rejects when team hard cap would be exceeded", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      teamDailyUsage: { cost: mockMoney(45) },
      teamHardCap: mockMoney(50),
      userTeamId: "team-1",
      userCapOverrides: { userSoftCap: null, userHardCap: null },
    }), null as unknown as Money, null as unknown as Money)

    const result = await enforcer.check("user-1", mockMoney(10))
    expect(result.allowed).toBe(false)
    expect(result.suggestedAction).toBe("reject")
    expect(result.capScope).toBe("team")
    expect(result.reason).toContain("Per-team daily hard cap")
  })

  it("rejects when company hard cap would be exceeded", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      companyDailyUsage: { cost: mockMoney(480) },
      companyHardCap: mockMoney(500),
      userEntityId: "entity-1",
      userCapOverrides: { userSoftCap: null, userHardCap: null },
    }), null as unknown as Money, null as unknown as Money)

    const result = await enforcer.check("user-1", mockMoney(30))
    expect(result.allowed).toBe(false)
    expect(result.suggestedAction).toBe("reject")
    expect(result.capScope).toBe("company")
    expect(result.reason).toContain("Per-company daily hard cap")
  })

  it("uses default caps when no overrides are set", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      userDailyUsage: { cost: mockMoney(3.00), totalPromptTokens: 1000, totalCompletionTokens: 500, callCount: 8 },
    }), mockMoney(3), mockMoney(5))

    const result = await enforcer.check("user-1", mockMoney(0.50))
    expect(result.allowed).toBe(true)
    expect(result.suggestedAction).toBe("degrade_to_ollama")
    expect(result.reason).toContain("Per-user daily soft cap")
  })

  it("allows when no caps are configured at any level", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      userDailyUsage: { cost: mockMoney(999), totalPromptTokens: 100000, totalCompletionTokens: 50000, callCount: 500 },
      userCapOverrides: { userSoftCap: null, userHardCap: null },
    }), null as unknown as Money, null as unknown as Money)

    const result = await enforcer.check("user-1", mockMoney(999))
    expect(result.allowed).toBe(true)
    expect(result.suggestedAction).toBe("proceed")
  })

  it("team cap is checked before company cap", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      teamDailyUsage: { cost: mockMoney(48) },
      teamHardCap: mockMoney(50),
      companyDailyUsage: { cost: mockMoney(490) },
      companyHardCap: mockMoney(500),
      userTeamId: "team-1",
      userEntityId: "entity-1",
      userCapOverrides: { userSoftCap: null, userHardCap: null },
    }), null as unknown as Money, null as unknown as Money)

    const result = await enforcer.check("user-1", mockMoney(5))
    expect(result.allowed).toBe(false)
    expect(result.capScope).toBe("team")
  })

  it("returns current spend in result", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      userDailyUsage: { cost: mockMoney(2.00), totalPromptTokens: 500, totalCompletionTokens: 200, callCount: 4 },
      userCapOverrides: { userSoftCap: mockMoney(3), userHardCap: mockMoney(5) },
    }), mockMoney(3), mockMoney(5))

    const result = await enforcer.check("user-1", mockMoney(1.00))
    expect(result.allowed).toBe(true)
    expect(result.currentSpend!.toAmount()).toBe(2.00)
  })

  it("rejects 11th call when $1 daily hard cap is set ($0.10/call)", async () => {
    let cumulativeCents = 0

    const dataSource = {
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

    const enforcer = new CapEnforcer(dataSource, null as unknown as Money, null as unknown as Money)

    for (let i = 0; i < 10; i++) {
      const result = await enforcer.check("user-1", Money.fromCents(10, "USD"))
      expect(result.allowed).toBe(true)
      cumulativeCents += 10
    }

    const result = await enforcer.check("user-1", Money.fromCents(10, "USD"))
    expect(result.allowed).toBe(false)
    expect(result.suggestedAction).toBe("reject")
    expect(result.capScope).toBe("user")
  })
})
