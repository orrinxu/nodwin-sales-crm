import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

const defaultCtx = {
  user: { id: "user-1", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

function buildQuery(returnData: unknown[] | null, error?: { message: string }) {
  mockSelect.mockResolvedValue({
    data: returnData,
    error: error ?? null,
  })
  mockFrom.mockReturnValue({
    select: mockSelect,
  })
}

function buildOrderLimitQuery(returnData: unknown[] | null, error?: { message: string }) {
  mockLimit.mockResolvedValue({
    data: returnData,
    error: error ?? null,
  })
  mockOrder.mockReturnValue({ limit: mockLimit })
  mockSelect.mockReturnValue({ order: mockOrder })
  mockFrom.mockReturnValue({
    select: mockSelect,
  })
}

describe("getSalesMetrics", () => {
  it("returns zero metrics when there is no data", async () => {
    buildQuery([])
    const { getSalesMetrics } = await import("./dashboard")
    const result = await getSalesMetrics(defaultCtx)

    expect(result.pipelineValue).toBe("0.00")
    expect(result.pipelineCurrency).toBe("USD")
    expect(result.dealsWon).toBe(0)
    expect(result.dealsLost).toBe(0)
    expect(result.winRate).toBe(0)
    expect(result.avgDealSize).toBe("0.00")
    expect(result.avgDealCurrency).toBe("USD")
  })

  it("handles null data gracefully", async () => {
    buildQuery(null)
    const { getSalesMetrics } = await import("./dashboard")
    const result = await getSalesMetrics(defaultCtx)

    expect(result.dealsWon).toBe(0)
    expect(result.dealsLost).toBe(0)
    expect(result.pipelineValue).toBe("0.00")
  })

  it("computes pipeline value from non-terminal stages", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "USD" },
      { stage: "propose", amount: 5000, currency: "USD" },
      { stage: "closed_won", amount: 25000, currency: "USD" },
      { stage: "closed_lost", amount: 10000, currency: "USD" },
    ])
    const { getSalesMetrics } = await import("./dashboard")
    const result = await getSalesMetrics(defaultCtx)

    expect(result.pipelineValue).toBe("15000.00")
    expect(result.dealsWon).toBe(1)
    expect(result.dealsLost).toBe(1)
  })

  it("calculates win rate correctly", async () => {
    buildQuery([
      { stage: "closed_won", amount: 50000, currency: "USD" },
      { stage: "closed_won", amount: 25000, currency: "USD" },
      { stage: "closed_lost", amount: 15000, currency: "USD" },
    ])
    const { getSalesMetrics } = await import("./dashboard")
    const result = await getSalesMetrics(defaultCtx)

    expect(result.dealsWon).toBe(2)
    expect(result.dealsLost).toBe(1)
    expect(result.winRate).toBe(67)
  })

  it("returns zero win rate when there are no won or lost deals", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "USD" },
      { stage: "propose", amount: 5000, currency: "USD" },
    ])
    const { getSalesMetrics } = await import("./dashboard")
    const result = await getSalesMetrics(defaultCtx)

    expect(result.winRate).toBe(0)
  })

  it("returns 100% win rate when all closed deals are won", async () => {
    buildQuery([
      { stage: "closed_won", amount: 50000, currency: "USD" },
      { stage: "closed_won", amount: 25000, currency: "USD" },
    ])
    const { getSalesMetrics } = await import("./dashboard")
    const result = await getSalesMetrics(defaultCtx)

    expect(result.winRate).toBe(100)
    expect(result.dealsLost).toBe(0)
  })

  it("ignores non-USD deals", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "EUR" },
      { stage: "qualify", amount: 5000, currency: "USD" },
    ])
    const { getSalesMetrics } = await import("./dashboard")
    const result = await getSalesMetrics(defaultCtx)

    expect(result.pipelineValue).toBe("5000.00")
  })

  it("handles null amount gracefully", async () => {
    buildQuery([
      { stage: "qualify", amount: null, currency: "USD" },
    ])
    const { getSalesMetrics } = await import("./dashboard")
    const result = await getSalesMetrics(defaultCtx)

    expect(result.pipelineValue).toBe("0.00")
  })

  it("handles missing stage by defaulting to qualify", async () => {
    buildQuery([
      { stage: null, amount: 10000, currency: "USD" },
    ])
    const { getSalesMetrics } = await import("./dashboard")
    const result = await getSalesMetrics(defaultCtx)

    expect(result.pipelineValue).toBe("10000.00")
    expect(result.dealsWon).toBe(0)
  })

  it("computes average deal size correctly", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "USD" },
      { stage: "propose", amount: 20000, currency: "USD" },
    ])
    const { getSalesMetrics } = await import("./dashboard")
    const result = await getSalesMetrics(defaultCtx)

    expect(result.avgDealSize).toBe("15000.00")
  })

  it("avg deal size excludes closed-lost deals", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "USD" },
      { stage: "closed_lost", amount: 20000, currency: "USD" },
    ])
    const { getSalesMetrics } = await import("./dashboard")
    const result = await getSalesMetrics(defaultCtx)

    expect(result.avgDealSize).toBe("10000.00")
  })

  it("throws on supabase error", async () => {
    buildQuery(null, { message: "Connection refused" })
    const { getSalesMetrics } = await import("./dashboard")
    await expect(getSalesMetrics(defaultCtx)).rejects.toThrow(
      "Failed to load sales metrics: Connection refused",
    )
  })
})

describe("getDashboardPipelineSummary", () => {
  it("returns all stages with zero counts for empty data", async () => {
    buildQuery([])
    const { getDashboardPipelineSummary } = await import("./dashboard")
    const result = await getDashboardPipelineSummary(defaultCtx)

    expect(result.stages).toHaveLength(7)
    expect(result.totalCount).toBe(0)
    expect(result.totalAmount).toBe("0.00")
    expect(result.currency).toBe("USD")
    for (const stage of result.stages) {
      expect(stage.count).toBe(0)
      expect(stage.totalAmount).toBe("0.00")
    }
  })

  it("handles null data gracefully", async () => {
    buildQuery(null)
    const { getDashboardPipelineSummary } = await import("./dashboard")
    const result = await getDashboardPipelineSummary(defaultCtx)

    expect(result.totalCount).toBe(0)
  })

  it("aggregates opportunities by stage", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "USD" },
      { stage: "qualify", amount: 5000, currency: "USD" },
      { stage: "closed_won", amount: 25000, currency: "USD" },
    ])
    const { getDashboardPipelineSummary } = await import("./dashboard")
    const result = await getDashboardPipelineSummary(defaultCtx)

    expect(result.totalCount).toBe(3)
    expect(result.totalAmount).toBe("40000.00")

    const qualify = result.stages.find((s) => s.stage === "qualify")
    expect(qualify?.count).toBe(2)
    expect(qualify?.totalAmount).toBe("15000.00")
    expect(qualify?.label).toBe("Qualify")

    const closedWon = result.stages.find((s) => s.stage === "closed_won")
    expect(closedWon?.count).toBe(1)
    expect(closedWon?.totalAmount).toBe("25000.00")
    expect(closedWon?.label).toBe("Closed Won")

    const negotiate = result.stages.find((s) => s.stage === "negotiate")
    expect(negotiate?.count).toBe(0)
  })

  it("all stages are present in order", async () => {
    buildQuery([])
    const { getDashboardPipelineSummary } = await import("./dashboard")
    const result = await getDashboardPipelineSummary(defaultCtx)

    const stageOrder = [
      "qualify",
      "meet_and_present",
      "propose",
      "negotiate",
      "verbal_agreement",
      "closed_won",
      "closed_lost",
    ]
    expect(result.stages.map((s) => s.stage)).toEqual(stageOrder)
  })

  it("handles null amount gracefully", async () => {
    buildQuery([
      { stage: "propose", amount: null, currency: "USD" },
    ])
    const { getDashboardPipelineSummary } = await import("./dashboard")
    const result = await getDashboardPipelineSummary(defaultCtx)

    const propose = result.stages.find((s) => s.stage === "propose")
    expect(propose?.count).toBe(1)
    expect(propose?.totalAmount).toBe("0.00")
  })

  it("ignores non-USD amounts but still counts them", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "EUR" },
      { stage: "qualify", amount: 5000, currency: "USD" },
    ])
    const { getDashboardPipelineSummary } = await import("./dashboard")
    const result = await getDashboardPipelineSummary(defaultCtx)

    const qualify = result.stages.find((s) => s.stage === "qualify")
    expect(qualify?.count).toBe(2)
    expect(qualify?.totalAmount).toBe("5000.00")
  })

  it("throws on supabase error", async () => {
    buildQuery(null, { message: "Connection refused" })
    const { getDashboardPipelineSummary } = await import("./dashboard")
    await expect(getDashboardPipelineSummary(defaultCtx)).rejects.toThrow(
      "Failed to load dashboard pipeline data: Connection refused",
    )
  })
})

describe("getRecentActivities", () => {
  it("returns empty array when there is no data", async () => {
    buildOrderLimitQuery([])
    const { getRecentActivities } = await import("./dashboard")
    const result = await getRecentActivities(defaultCtx)

    expect(result).toEqual([])
  })

  it("handles null data gracefully", async () => {
    buildOrderLimitQuery(null)
    const { getRecentActivities } = await import("./dashboard")
    const result = await getRecentActivities(defaultCtx)

    expect(result).toEqual([])
  })

  it("maps activity rows to domain records", async () => {
    buildOrderLimitQuery([
      {
        id: "act-1",
        account_id: "acct-1",
        opportunity_id: "opp-1",
        user_id: "user-1",
        type: "call",
        external_thread_id: null,
        subject: "Intro call",
        body: "Discussed requirements",
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        author: { full_name: "Alice" },
      },
    ])
    const { getRecentActivities } = await import("./dashboard")
    const result = await getRecentActivities(defaultCtx)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("act-1")
    expect(result[0].accountId).toBe("acct-1")
    expect(result[0].opportunityId).toBe("opp-1")
    expect(result[0].userId).toBe("user-1")
    expect(result[0].userName).toBe("Alice")
    expect(result[0].type).toBe("call")
    expect(result[0].subject).toBe("Intro call")
    expect(result[0].body).toBe("Discussed requirements")
    expect(result[0].metadata).toEqual({})
  })

  it("handles null author", async () => {
    buildOrderLimitQuery([
      {
        id: "act-1",
        account_id: null,
        opportunity_id: null,
        user_id: "user-1",
        type: "note",
        external_thread_id: null,
        subject: null,
        body: null,
        metadata: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        author: null,
      },
    ])
    const { getRecentActivities } = await import("./dashboard")
    const result = await getRecentActivities(defaultCtx)

    expect(result[0].userName).toBeNull()
    expect(result[0].accountId).toBeNull()
    expect(result[0].subject).toBeNull()
    expect(result[0].body).toBeNull()
    expect(result[0].metadata).toEqual({})
  })

  it("respects the limit parameter", async () => {
    buildOrderLimitQuery([])
    const { getRecentActivities } = await import("./dashboard")
    await getRecentActivities(defaultCtx, 5)

    expect(mockLimit).toHaveBeenCalledWith(5)
  })

  it("defaults limit to 10", async () => {
    buildOrderLimitQuery([])
    const { getRecentActivities } = await import("./dashboard")
    await getRecentActivities(defaultCtx)

    expect(mockLimit).toHaveBeenCalledWith(10)
  })

  it("queries activities table with author join and ordered by created_at desc", async () => {
    buildOrderLimitQuery([])
    const { getRecentActivities } = await import("./dashboard")
    await getRecentActivities(defaultCtx)

    expect(mockFrom).toHaveBeenCalledWith("activities")
    expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: false })
  })

  it("throws on supabase error", async () => {
    buildOrderLimitQuery(null, { message: "Connection refused" })
    const { getRecentActivities } = await import("./dashboard")
    await expect(getRecentActivities(defaultCtx)).rejects.toThrow(
      "Failed to load recent activities: Connection refused",
    )
  })
})

describe("getRecentDeals", () => {
  it("returns empty array when there is no data", async () => {
    buildOrderLimitQuery([])
    const { getRecentDeals } = await import("./dashboard")
    const result = await getRecentDeals(defaultCtx)

    expect(result).toEqual([])
  })

  it("handles null data gracefully", async () => {
    buildOrderLimitQuery(null)
    const { getRecentDeals } = await import("./dashboard")
    const result = await getRecentDeals(defaultCtx)

    expect(result).toEqual([])
  })

  it("maps opportunity rows to domain records", async () => {
    buildOrderLimitQuery([
      {
        id: "opp-1",
        name: "Big Deal",
        account_id: "acct-1",
        primary_contact_id: "contact-1",
        stage: "propose",
        probability_pct: 60,
        amount: 50000,
        currency: "USD",
        owner_user_id: "user-1",
        sales_unit_id: "su-1",
        description: "A big deal",
        close_date: "2026-06-30",
        loss_reason: null,
        custom_data: { priority: "high" },
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
        account: { name: "Acme Corp" },
        owner: { full_name: "Bob" },
      },
    ])
    const { getRecentDeals } = await import("./dashboard")
    const result = await getRecentDeals(defaultCtx)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("opp-1")
    expect(result[0].name).toBe("Big Deal")
    expect(result[0].accountId).toBe("acct-1")
    expect(result[0].accountName).toBe("Acme Corp")
    expect(result[0].primaryContactId).toBe("contact-1")
    expect(result[0].stage).toBe("propose")
    expect(result[0].probabilityPct).toBe(60)
    expect(result[0].amount).toBe("50000.00")
    expect(result[0].currency).toBe("USD")
    expect(result[0].ownerUserId).toBe("user-1")
    expect(result[0].ownerName).toBe("Bob")
    expect(result[0].salesUnitId).toBe("su-1")
    expect(result[0].description).toBe("A big deal")
    expect(result[0].closeDate).toBe("2026-06-30")
    expect(result[0].customData).toEqual({ priority: "high" })
  })

  it("handles null account and owner", async () => {
    buildOrderLimitQuery([
      {
        id: "opp-1",
        name: "Solo Deal",
        account_id: "acct-1",
        primary_contact_id: null,
        stage: "qualify",
        probability_pct: 0,
        amount: null,
        currency: "USD",
        owner_user_id: "user-1",
        sales_unit_id: "su-1",
        description: null,
        close_date: null,
        loss_reason: null,
        custom_data: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        account: null,
        owner: null,
      },
    ])
    const { getRecentDeals } = await import("./dashboard")
    const result = await getRecentDeals(defaultCtx)

    expect(result[0].accountName).toBeNull()
    expect(result[0].ownerName).toBeNull()
    expect(result[0].amount).toBe("0.00")
    expect(result[0].customData).toEqual({})
  })

  it("respects the limit parameter", async () => {
    buildOrderLimitQuery([])
    const { getRecentDeals } = await import("./dashboard")
    await getRecentDeals(defaultCtx, 3)

    expect(mockLimit).toHaveBeenCalledWith(3)
  })

  it("defaults limit to 5", async () => {
    buildOrderLimitQuery([])
    const { getRecentDeals } = await import("./dashboard")
    await getRecentDeals(defaultCtx)

    expect(mockLimit).toHaveBeenCalledWith(5)
  })

  it("queries opportunities table with account and owner joins ordered by updated_at desc", async () => {
    buildOrderLimitQuery([])
    const { getRecentDeals } = await import("./dashboard")
    await getRecentDeals(defaultCtx)

    expect(mockFrom).toHaveBeenCalledWith("opportunities")
    expect(mockOrder).toHaveBeenCalledWith("updated_at", { ascending: false })
  })

  it("throws on supabase error", async () => {
    buildOrderLimitQuery(null, { message: "Connection refused" })
    const { getRecentDeals } = await import("./dashboard")
    await expect(getRecentDeals(defaultCtx)).rejects.toThrow(
      "Failed to load recent deals: Connection refused",
    )
  })
})
