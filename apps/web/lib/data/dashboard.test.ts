import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockCurrenciesIn = vi.fn()
const mockCurrenciesSelect = vi.fn()
const mockLookupRate = vi.fn()
const mockConvertWithRate = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock("@/lib/money/convert", () => ({
  lookupRate: mockLookupRate,
  convertWithRate: mockConvertWithRate,
}))

const defaultCtx = {
  user: { id: "user-1", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: currencies table returns USD scale 2
  mockCurrenciesIn.mockResolvedValue({
    data: [{ code: "USD", scale: 2 }],
    error: null,
  })
  mockCurrenciesSelect.mockReturnValue({ in: mockCurrenciesIn })
  // Default: return currency rate (1 INR → 0.01 USD)
  mockLookupRate.mockResolvedValue({
    rate: 0.01,
    from_currency: "INR",
    to_currency: "USD",
    source: "test",
    effective_date: "2026-06-18",
  })
  // Mock returns amount proportional to input for realistic conversion
  mockConvertWithRate.mockImplementation((amount: bigint) => {
    // Simulate: 10000 INR → 100 USD (10000 * 0.01 = 100)
    // Input is in cents: 1000000n INR cents → 10000n USD cents = $100.00
    // eslint-disable-next-line custom/no-unsafe-numeric-coercion -- test mock conversion helper, not production money code
    return amount / 100n
  })
})

function buildQuery(returnData: unknown[] | null, error?: { message: string }) {
  mockSelect.mockResolvedValue({
    data: returnData,
    error: error ?? null,
  })
  mockFrom.mockImplementation((table: string) => {
    if (table === "currencies") {
      return { select: mockCurrenciesSelect }
    }
    if (
      table === "user_preferences" ||
      table === "users" ||
      table === "reporting_currency_settings"
    ) {
      // Reporting-currency resolution: no display pref, no entity, no override
      // row → falls back to USD.
      const nullResult = { maybeSingle: () => Promise.resolve({ data: null, error: null }) }
      return { select: () => ({ eq: () => nullResult, is: () => nullResult }) }
    }
    return { select: mockSelect }
  })
}

function buildOrderLimitQuery(returnData: unknown[] | null, error?: { message: string }) {
  mockLimit.mockResolvedValue({
    data: returnData,
    error: error ?? null,
  })
  mockOrder.mockReturnValue({ limit: mockLimit })
  mockSelect.mockReturnValue({ order: mockOrder })
  mockFrom.mockImplementation((table: string) => {
    if (table === "currencies") {
      return { select: mockCurrenciesSelect }
    }
    if (
      table === "user_preferences" ||
      table === "users" ||
      table === "reporting_currency_settings"
    ) {
      // Reporting-currency resolution: no display pref, no entity, no override
      // row → falls back to USD.
      const nullResult = { maybeSingle: () => Promise.resolve({ data: null, error: null }) }
      return { select: () => ({ eq: () => nullResult, is: () => nullResult }) }
    }
    return { select: mockSelect }
  })
}

describe("getPipelineMetrics", () => {
  it("returns zero metrics when there is no data", async () => {
    buildQuery([])
    const { getPipelineMetrics } = await import("./metrics")
    const result = await getPipelineMetrics(defaultCtx)

    expect(result.pipelineValue).toBe(0)
    expect(result.dealsWon).toBe(0)
    expect(result.dealsLost).toBe(0)
    expect(result.winRate).toBe(0)
    expect(result.avgDealSize).toBe(0)
    expect(result.unconvertibleCount).toBe(0)
    expect(result.currency).toBe("USD")
  })

  it("handles null data gracefully", async () => {
    buildQuery(null)
    const { getPipelineMetrics } = await import("./metrics")
    const result = await getPipelineMetrics(defaultCtx)

    expect(result.dealsWon).toBe(0)
    expect(result.dealsLost).toBe(0)
    expect(result.pipelineValue).toBe(0)
  })

  it("computes pipeline value from non-terminal stages", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "USD" },
      { stage: "propose", amount: 5000, currency: "USD" },
      { stage: "closed_won", amount: 25000, currency: "USD" },
      { stage: "closed_lost", amount: 10000, currency: "USD" },
    ])
    const { getPipelineMetrics } = await import("./metrics")
    const result = await getPipelineMetrics(defaultCtx)

    expect(result.pipelineValue).toBe(15000)
    expect(result.dealsWon).toBe(1)
    expect(result.dealsLost).toBe(1)
  })

  it("averages deal size across all deals, including lost ones", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "USD" }, // active
      { stage: "propose", amount: 5000, currency: "USD" }, // active
      { stage: "closed_won", amount: 25000, currency: "USD" }, // won
      { stage: "closed_lost", amount: 10000, currency: "USD" }, // lost
    ])
    const { getPipelineMetrics } = await import("./metrics")
    const result = await getPipelineMetrics(defaultCtx)

    // totalAmount 50000 over all 4 deals → 12500. The old denominator omitted
    // the lost deal (50000 / 3 ≈ 16667), which was the bug.
    expect(result.avgDealSize).toBe(12500)
  })

  it("calculates win rate correctly", async () => {
    buildQuery([
      { stage: "closed_won", amount: 50000, currency: "USD" },
      { stage: "closed_won", amount: 25000, currency: "USD" },
      { stage: "closed_lost", amount: 15000, currency: "USD" },
    ])
    const { getPipelineMetrics } = await import("./metrics")
    const result = await getPipelineMetrics(defaultCtx)

    expect(result.dealsWon).toBe(2)
    expect(result.dealsLost).toBe(1)
    expect(result.winRate).toBe(67)
  })

  it("returns zero win rate when there are no won or lost deals", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "USD" },
      { stage: "propose", amount: 5000, currency: "USD" },
    ])
    const { getPipelineMetrics } = await import("./metrics")
    const result = await getPipelineMetrics(defaultCtx)

    expect(result.winRate).toBe(0)
  })

  it("returns 100% win rate when all closed deals are won", async () => {
    buildQuery([
      { stage: "closed_won", amount: 50000, currency: "USD" },
      { stage: "closed_won", amount: 25000, currency: "USD" },
    ])
    const { getPipelineMetrics } = await import("./metrics")
    const result = await getPipelineMetrics(defaultCtx)

    expect(result.winRate).toBe(100)
    expect(result.dealsLost).toBe(0)
  })

  it("converts non-USD deals to USD using available rates", async () => {
    // INR deal, lookupRate returns rate, convertWithRate returns 100 (USD cents)
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "INR" },
      { stage: "qualify", amount: 5000, currency: "USD" },
    ])
    const { getPipelineMetrics } = await import("./metrics")
    const result = await getPipelineMetrics(defaultCtx)

    expect(result.unconvertibleCount).toBe(0)
    // 5000 USD + 100 converted INR = 5100
    expect(result.pipelineValue).toBe(5100)
  })

  it("counts deals with no available rate as unconvertible and excludes them", async () => {
    mockLookupRate.mockResolvedValue(null)
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "XYZ" },
      { stage: "qualify", amount: 5000, currency: "USD" },
    ])
    const { getPipelineMetrics } = await import("./metrics")
    const result = await getPipelineMetrics(defaultCtx)

    expect(result.unconvertibleCount).toBe(1)
    expect(result.pipelineValue).toBe(5000)
  })

  it("skips deals without amount (amount=0)", async () => {
    buildQuery([
      { stage: "qualify", amount: 0, currency: "USD" },
      { stage: "qualify", amount: 5000, currency: "USD" },
    ])
    const { getPipelineMetrics } = await import("./metrics")
    const result = await getPipelineMetrics(defaultCtx)

    expect(result.pipelineValue).toBe(5000)
  })

  it("handles null amount gracefully", async () => {
    buildQuery([
      { stage: "qualify", amount: null, currency: "USD" },
    ])
    const { getPipelineMetrics } = await import("./metrics")
    const result = await getPipelineMetrics(defaultCtx)

    expect(result.pipelineValue).toBe(0)
  })

  it("treats missing stage as non-terminal", async () => {
    buildQuery([
      { stage: null, amount: 10000, currency: "USD" },
    ])
    const { getPipelineMetrics } = await import("./metrics")
    const result = await getPipelineMetrics(defaultCtx)

    expect(result.pipelineValue).toBe(10000)
    expect(result.dealsWon).toBe(0)
  })

  it("throws on supabase error", async () => {
    buildQuery(null, { message: "Connection refused" })
    const { getPipelineMetrics } = await import("./metrics")
    await expect(getPipelineMetrics(defaultCtx)).rejects.toThrow(
      "Failed to load pipeline metrics: Connection refused",
    )
  })
})

describe("getPipelineSummary", () => {
  it("returns all stages with zero counts for empty data", async () => {
    buildQuery([])
    const { getPipelineSummary } = await import("./metrics")
    const result = await getPipelineSummary(defaultCtx)

    expect(result.stages).toHaveLength(7)
    expect(result.totalCount).toBe(0)
    expect(result.totalAmount).toBe(0)
    expect(result.currency).toBe("USD")
    for (const stage of result.stages) {
      expect(stage.count).toBe(0)
      expect(stage.amount).toBe(0)
    }
  })

  it("handles null data gracefully", async () => {
    buildQuery(null)
    const { getPipelineSummary } = await import("./metrics")
    const result = await getPipelineSummary(defaultCtx)

    expect(result.totalCount).toBe(0)
  })

  it("aggregates opportunities by stage", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "USD" },
      { stage: "qualify", amount: 5000, currency: "USD" },
      { stage: "closed_won", amount: 25000, currency: "USD" },
    ])
    const { getPipelineSummary } = await import("./metrics")
    const result = await getPipelineSummary(defaultCtx)

    expect(result.totalCount).toBe(3)
    expect(result.totalAmount).toBe(40000)

    const qualify = result.stages.find((s) => s.stage === "qualify")
    expect(qualify?.count).toBe(2)
    expect(qualify?.amount).toBe(15000)
    expect(qualify?.label).toBe("Qualify")

    const closedWon = result.stages.find((s) => s.stage === "closed_won")
    expect(closedWon?.count).toBe(1)
    expect(closedWon?.amount).toBe(25000)

    const negotiate = result.stages.find((s) => s.stage === "negotiate")
    expect(negotiate?.count).toBe(0)
  })

  it("all stages are present in order", async () => {
    buildQuery([])
    const { getPipelineSummary } = await import("./metrics")
    const result = await getPipelineSummary(defaultCtx)

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

  it("converts non-USD amounts and includes them in totals", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "INR" },
      { stage: "qualify", amount: 5000, currency: "USD" },
    ])
    const { getPipelineSummary } = await import("./metrics")
    const result = await getPipelineSummary(defaultCtx)

    const qualify = result.stages.find((s) => s.stage === "qualify")
    expect(qualify?.count).toBe(2)
    // 5000 USD + 100 converted INR = 5100
    expect(qualify?.amount).toBe(5100)
    expect(result.totalAmount).toBe(5100)
  })

  it("excludes unconvertible amounts but still counts them", async () => {
    mockLookupRate.mockResolvedValue(null)
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "XYZ" },
      { stage: "qualify", amount: 5000, currency: "USD" },
    ])
    const { getPipelineSummary } = await import("./metrics")
    const result = await getPipelineSummary(defaultCtx)

    const qualify = result.stages.find((s) => s.stage === "qualify")
    expect(qualify?.count).toBe(1)
    expect(result.totalCount).toBe(1)
    expect(qualify?.amount).toBe(5000)
    expect(result.totalAmount).toBe(5000)
  })

  it("handles null amount gracefully", async () => {
    buildQuery([
      { stage: "propose", amount: null, currency: "USD" },
    ])
    const { getPipelineSummary } = await import("./metrics")
    const result = await getPipelineSummary(defaultCtx)

    const propose = result.stages.find((s) => s.stage === "propose")
    expect(propose?.count).toBe(1)
    expect(propose?.amount).toBe(0)
  })

  it("throws on supabase error", async () => {
    buildQuery(null, { message: "Connection refused" })
    const { getPipelineSummary } = await import("./metrics")
    await expect(getPipelineSummary(defaultCtx)).rejects.toThrow(
      "Failed to load pipeline summary: Connection refused",
    )
  })
})

describe("getRecentActivities", () => {
  it("returns empty array when there is no data", async () => {
    buildOrderLimitQuery([])
    const { getRecentActivities } = await import("./metrics")
    const result = await getRecentActivities(defaultCtx)

    expect(result).toEqual([])
  })

  it("handles null data gracefully", async () => {
    buildOrderLimitQuery(null)
    const { getRecentActivities } = await import("./metrics")
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
    const { getRecentActivities } = await import("./metrics")
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
    const { getRecentActivities } = await import("./metrics")
    const result = await getRecentActivities(defaultCtx)

    expect(result[0].userName).toBeNull()
    expect(result[0].accountId).toBeNull()
    expect(result[0].subject).toBeNull()
    expect(result[0].body).toBeNull()
    expect(result[0].metadata).toEqual({})
  })

  it("respects the limit parameter", async () => {
    buildOrderLimitQuery([])
    const { getRecentActivities } = await import("./metrics")
    await getRecentActivities(defaultCtx, 5)

    expect(mockLimit).toHaveBeenCalledWith(5)
  })

  it("defaults limit to 10", async () => {
    buildOrderLimitQuery([])
    const { getRecentActivities } = await import("./metrics")
    await getRecentActivities(defaultCtx)

    expect(mockLimit).toHaveBeenCalledWith(10)
  })

  it("queries activities table with author join and ordered by created_at desc", async () => {
    buildOrderLimitQuery([])
    const { getRecentActivities } = await import("./metrics")
    await getRecentActivities(defaultCtx)

    expect(mockFrom).toHaveBeenCalledWith("activities")
    expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: false })
  })

  it("throws on supabase error", async () => {
    buildOrderLimitQuery(null, { message: "Connection refused" })
    const { getRecentActivities } = await import("./metrics")
    await expect(getRecentActivities(defaultCtx)).rejects.toThrow(
      "Failed to load recent activities: Connection refused",
    )
  })
})

describe("getRecentDeals", () => {
  it("returns empty array when there is no data", async () => {
    buildOrderLimitQuery([])
    const { getRecentDeals } = await import("./metrics")
    const result = await getRecentDeals(defaultCtx)

    expect(result).toEqual([])
  })

  it("handles null data gracefully", async () => {
    buildOrderLimitQuery(null)
    const { getRecentDeals } = await import("./metrics")
    const result = await getRecentDeals(defaultCtx)

    expect(result).toEqual([])
  })

  it("maps opportunity rows to domain records", async () => {
    buildOrderLimitQuery([
      {
        id: "opp-1",
        name: "Big Deal",
        stage: "propose",
        amount: 50000,
        currency: "USD",
        probability_pct: 60,
        close_date: "2026-06-30",
        account: { name: "Acme Corp" },
      },
    ])
    const { getRecentDeals } = await import("./metrics")
    const result = await getRecentDeals(defaultCtx)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("opp-1")
    expect(result[0].name).toBe("Big Deal")
    expect(result[0].company).toBe("Acme Corp")
    expect(result[0].stage).toBe("propose")
    expect(result[0].stageLabel).toBe("Propose")
    expect(result[0].probabilityPct).toBe(60)
    expect(result[0].amount).toBe(50000)
    expect(result[0].currency).toBe("USD")
    expect(result[0].closeDate).toBe("2026-06-30")
  })

  it("handles null account", async () => {
    buildOrderLimitQuery([
      {
        id: "opp-1",
        name: "Solo Deal",
        stage: "qualify",
        probability_pct: 0,
        amount: null,
        currency: "USD",
        close_date: null,
        account: null,
      },
    ])
    const { getRecentDeals } = await import("./metrics")
    const result = await getRecentDeals(defaultCtx)

    expect(result[0].company).toBeNull()
    expect(result[0].amount).toBe(0)
    expect(result[0].currency).toBe("USD")
  })

  it("converts a non-reporting-currency deal into the reporting currency", async () => {
    buildOrderLimitQuery([
      {
        id: "opp-2",
        name: "INR Deal",
        stage: "qualify",
        amount: 10000,
        currency: "INR",
        probability_pct: 40,
        close_date: null,
        account: { name: "Globex" },
      },
    ])
    const { getRecentDeals } = await import("./metrics")
    const result = await getRecentDeals(defaultCtx)

    // 10000 INR → 100 USD via the mocked rate; reported in the reporting currency.
    expect(result[0].amount).toBe(100)
    expect(result[0].currency).toBe("USD")
  })

  it("keeps an unconvertible deal in its own currency instead of dropping it", async () => {
    mockLookupRate.mockResolvedValue(null)
    buildOrderLimitQuery([
      {
        id: "opp-3",
        name: "No-rate Deal",
        stage: "qualify",
        amount: 7500,
        currency: "XYZ",
        probability_pct: 20,
        close_date: null,
        account: null,
      },
    ])
    const { getRecentDeals } = await import("./metrics")
    const result = await getRecentDeals(defaultCtx)

    // Still returned (a list, not an aggregate), shown in its own currency so it
    // is never mislabelled under the reporting-currency symbol.
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(7500)
    expect(result[0].currency).toBe("XYZ")
  })

  it("respects the limit parameter", async () => {
    buildOrderLimitQuery([])
    const { getRecentDeals } = await import("./metrics")
    await getRecentDeals(defaultCtx, 3)

    expect(mockLimit).toHaveBeenCalledWith(3)
  })

  it("defaults limit to 5", async () => {
    buildOrderLimitQuery([])
    const { getRecentDeals } = await import("./metrics")
    await getRecentDeals(defaultCtx)

    expect(mockLimit).toHaveBeenCalledWith(5)
  })

  it("queries opportunities table with account join ordered by updated_at desc", async () => {
    buildOrderLimitQuery([])
    const { getRecentDeals } = await import("./metrics")
    await getRecentDeals(defaultCtx)

    expect(mockFrom).toHaveBeenCalledWith("opportunities")
    expect(mockOrder).toHaveBeenCalledWith("updated_at", { ascending: false })
  })

  it("throws on supabase error", async () => {
    buildOrderLimitQuery(null, { message: "Connection refused" })
    const { getRecentDeals } = await import("./metrics")
    await expect(getRecentDeals(defaultCtx)).rejects.toThrow(
      "Failed to load recent deals: Connection refused",
    )
  })
})
