import { describe, it, expect } from "vitest"
import { CapEnforcer } from "./cap-enforcement"
import type { DailyUsage } from "./types"

function createMockDataSource(overrides?: {
  userDailyUsage?: DailyUsage
  teamDailyUsage?: { totalCostUsd: number }
  companyDailyUsage?: { totalCostUsd: number }
  userCapOverrides?: { userSoftCapUsd: number | null; userHardCapUsd: number | null }
  teamHardCap?: number | null
  companyHardCap?: number | null
  userTeamId?: string | null
  userEntityId?: string | null
}) {
  return {
    getUserDailyUsage: async (_userId: string): Promise<DailyUsage> =>
      overrides?.userDailyUsage ?? { totalCostUsd: 0, totalPromptTokens: 0, totalCompletionTokens: 0, callCount: 0 },

    getTeamDailyUsage: async (_teamId: string): Promise<{ totalCostUsd: number }> =>
      overrides?.teamDailyUsage ?? { totalCostUsd: 0 },

    getCompanyDailyUsage: async (_entityId: string): Promise<{ totalCostUsd: number }> =>
      overrides?.companyDailyUsage ?? { totalCostUsd: 0 },

    getUserCapOverrides: async (_userId: string) =>
      overrides?.userCapOverrides ?? { userSoftCapUsd: null, userHardCapUsd: null },

    getTeamHardCap: async (_teamId: string): Promise<number | null> =>
      overrides?.teamHardCap ?? null,

    getCompanyHardCap: async (_entityId: string): Promise<number | null> =>
      overrides?.companyHardCap ?? null,

    getUserTeamId: async (_userId: string): Promise<string | null> =>
      overrides?.userTeamId ?? null,

    getUserEntityId: async (_userId: string): Promise<string | null> =>
      overrides?.userEntityId ?? null,
  }
}

describe("CapEnforcer", () => {
  it("allows request when under all caps", async () => {
    const enforcer = new CapEnforcer(createMockDataSource(), 3, 5)
    const result = await enforcer.check("user-1", 0.50)
    expect(result.allowed).toBe(true)
    expect(result.suggestedAction).toBe("proceed")
    expect(result.reason).toBeNull()
  })

  it("rejects request when user hard cap would be exceeded", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      userDailyUsage: { totalCostUsd: 4.80, totalPromptTokens: 1000, totalCompletionTokens: 500, callCount: 8 },
      userCapOverrides: { userSoftCapUsd: 3, userHardCapUsd: 5 },
    }), 3, 5)

    const result = await enforcer.check("user-1", 0.50)
    expect(result.allowed).toBe(false)
    expect(result.suggestedAction).toBe("reject")
    expect(result.capScope).toBe("user")
    expect(result.reason).toContain("Per-user daily hard cap")
  })

  it("allows request when exactly at user hard cap", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      userDailyUsage: { totalCostUsd: 4.50, totalPromptTokens: 1000, totalCompletionTokens: 500, callCount: 8 },
      userCapOverrides: { userSoftCapUsd: 3, userHardCapUsd: 5 },
    }), 3, 5)

    const result = await enforcer.check("user-1", 0.50)
    expect(result.allowed).toBe(true)
    expect(result.suggestedAction).toBe("degrade_to_ollama")
    expect(result.capScope).toBe("user")
  })

  it("degrades to Ollama when user soft cap is exceeded but hard cap is not", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      userDailyUsage: { totalCostUsd: 3.50, totalPromptTokens: 1000, totalCompletionTokens: 500, callCount: 8 },
      userCapOverrides: { userSoftCapUsd: 3, userHardCapUsd: 5 },
    }), 3, 5)

    const result = await enforcer.check("user-1", 0.50)
    expect(result.allowed).toBe(true)
    expect(result.suggestedAction).toBe("degrade_to_ollama")
    expect(result.reason).toContain("Per-user daily soft cap")
  })

  it("rejects when team hard cap would be exceeded", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      teamDailyUsage: { totalCostUsd: 45 },
      teamHardCap: 50,
      userTeamId: "team-1",
      userCapOverrides: { userSoftCapUsd: null, userHardCapUsd: null },
    }), null as unknown as number, null as unknown as number)

    const result = await enforcer.check("user-1", 10)
    expect(result.allowed).toBe(false)
    expect(result.suggestedAction).toBe("reject")
    expect(result.capScope).toBe("team")
    expect(result.reason).toContain("Per-team daily hard cap")
  })

  it("rejects when company hard cap would be exceeded", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      companyDailyUsage: { totalCostUsd: 480 },
      companyHardCap: 500,
      userEntityId: "entity-1",
      userCapOverrides: { userSoftCapUsd: null, userHardCapUsd: null },
    }), null as unknown as number, null as unknown as number)

    const result = await enforcer.check("user-1", 30)
    expect(result.allowed).toBe(false)
    expect(result.suggestedAction).toBe("reject")
    expect(result.capScope).toBe("company")
    expect(result.reason).toContain("Per-company daily hard cap")
  })

  it("uses default caps when no overrides are set", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      userDailyUsage: { totalCostUsd: 3.00, totalPromptTokens: 1000, totalCompletionTokens: 500, callCount: 8 },
    }), 3, 5)

    const result = await enforcer.check("user-1", 0.50)
    expect(result.allowed).toBe(true)
    expect(result.suggestedAction).toBe("degrade_to_ollama")
    expect(result.reason).toContain("Per-user daily soft cap")
  })

  it("allows when no caps are configured at any level", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      userDailyUsage: { totalCostUsd: 999, totalPromptTokens: 100000, totalCompletionTokens: 50000, callCount: 500 },
      userCapOverrides: { userSoftCapUsd: null, userHardCapUsd: null },
    }), null as unknown as number, null as unknown as number)

    const result = await enforcer.check("user-1", 999)
    expect(result.allowed).toBe(true)
    expect(result.suggestedAction).toBe("proceed")
  })

  it("team cap is checked before company cap", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      teamDailyUsage: { totalCostUsd: 48 },
      teamHardCap: 50,
      companyDailyUsage: { totalCostUsd: 490 },
      companyHardCap: 500,
      userTeamId: "team-1",
      userEntityId: "entity-1",
      userCapOverrides: { userSoftCapUsd: null, userHardCapUsd: null },
    }), null as unknown as number, null as unknown as number)

    const result = await enforcer.check("user-1", 5)
    expect(result.allowed).toBe(false)
    expect(result.capScope).toBe("team")
  })

  it("returns current spend in result", async () => {
    const enforcer = new CapEnforcer(createMockDataSource({
      userDailyUsage: { totalCostUsd: 2.00, totalPromptTokens: 500, totalCompletionTokens: 200, callCount: 4 },
      userCapOverrides: { userSoftCapUsd: 3, userHardCapUsd: 5 },
    }), 3, 5)

    const result = await enforcer.check("user-1", 1.00)
    expect(result.allowed).toBe(true)
    expect(result.currentSpend).toBe(2.00)
  })

  it("rejects 11th call when $1 daily hard cap is set ($0.10/call)", async () => {
    let cumulativeSpend = 0
    const costPerCall = 0.10
    const hardCap = 1

    const dataSource = {
      getUserDailyUsage: async () => ({
        totalCostUsd: cumulativeSpend,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        callCount: Math.floor(cumulativeSpend / costPerCall),
      }),
      getTeamDailyUsage: async () => ({ totalCostUsd: 0 }),
      getCompanyDailyUsage: async () => ({ totalCostUsd: 0 }),
      getUserCapOverrides: async () => ({ userSoftCapUsd: null, userHardCapUsd: hardCap }),
      getTeamHardCap: async () => null,
      getCompanyHardCap: async () => null,
      getUserTeamId: async () => null,
      getUserEntityId: async () => null,
    }

    const enforcer = new CapEnforcer(dataSource, 3, 5)

    for (let i = 0; i < 10; i++) {
      const result = await enforcer.check("user-1", costPerCall)
      expect(result.allowed).toBe(true)
      cumulativeSpend += costPerCall
    }

    const result = await enforcer.check("user-1", costPerCall)
    expect(result.allowed).toBe(false)
    expect(result.suggestedAction).toBe("reject")
    expect(result.capScope).toBe("user")
  })
})
