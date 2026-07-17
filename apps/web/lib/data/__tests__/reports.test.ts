import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const ctx = { user: { id: "u1", email: "u1@nodwin.com", role: "admin" }, source: "web" as const }

// getReportData now reads three bounded GROUP BY RPCs (ORR-757) instead of a
// .limit(500) fetch. Mock the RPC dispatcher by function name.
const mockRpc = vi.fn()
function setRpc(results: Record<string, unknown[]>) {
  const byFn = new Map(Object.entries(results))
  mockRpc.mockImplementation((fn: string) =>
    Promise.resolve({ data: byFn.get(fn) ?? [], error: null }),
  )
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ rpc: mockRpc })),
}))

// FX is exercised elsewhere; here the identity conversion keeps the arithmetic
// readable (every bucket is already the reporting currency).
vi.mock("@/lib/data/metrics", () => ({
  resolveReportingCurrency: async () => "USD",
  fetchAndConvert: async (data: Array<Record<string, unknown>>) => ({
    converted: (data ?? []).map((d) => ({ ...d, amount: Number(d.amount) || 0, currency: "USD" })),
    unconvertibleCount: 0,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  setRpc({})
})

describe("getReportData", () => {
  it("aggregates pipeline by stage correctly", async () => {
    setRpc({
      pipeline_metrics_agg: [
        { stage: "qualify", currency: "USD", gross_amount: 10000, deal_count: 1 },
        { stage: "propose", currency: "USD", gross_amount: 50000, deal_count: 1 },
        { stage: "closed_won", currency: "USD", gross_amount: 100000, deal_count: 1 },
      ],
    })

    const { getReportData } = await import("../reports")
    const result = await getReportData(ctx)

    expect(result.pipelineByStage).toHaveLength(5)
    const qualify = result.pipelineByStage.find((s) => s.stage === "qualify")
    expect(qualify?.amount).toBe(10000)
    expect(qualify?.count).toBe(1)

    const propose = result.pipelineByStage.find((s) => s.stage === "propose")
    expect(propose?.amount).toBe(50000)

    expect(result.totalPipeline).toBe(60000)
    expect(result.wonLostRevenue.find((r) => r.type === "won")?.amount).toBe(100000)
    expect(result.winRate).toBe(100)
    expect(result.avgDealSize).toBe(100000)
  })

  it("handles empty data", async () => {
    setRpc({})

    const { getReportData } = await import("../reports")
    const result = await getReportData(ctx)

    expect(result.pipelineByStage).toHaveLength(5)
    expect(result.totalPipeline).toBe(0)
    expect(result.totalWon).toBe(0)
    expect(result.avgDealSize).toBe(0)
    expect(result.winRate).toBe(0)
    expect(result.monthlyTrends).toEqual([])
    expect(result.topAccounts).toEqual([])
  })

  it("computes win rate correctly", async () => {
    setRpc({
      pipeline_metrics_agg: [
        { stage: "closed_won", currency: "USD", gross_amount: 50000, deal_count: 1 },
        { stage: "closed_lost", currency: "USD", gross_amount: 0, deal_count: 2 },
      ],
    })

    const { getReportData } = await import("../reports")
    const result = await getReportData(ctx)

    expect(result.winRate).toBe(33)
    expect(result.totalWon).toBe(50000)
  })

  it("ranks top accounts by revenue", async () => {
    setRpc({
      report_top_accounts_agg: [
        { account_id: "acme", account_name: "Acme", currency: "USD", gross_amount: 130000, deal_count: 2 },
        { account_id: "beta", account_name: "Beta", currency: "USD", gross_amount: 5000, deal_count: 1 },
      ],
    })

    const { getReportData } = await import("../reports")
    const result = await getReportData(ctx)

    expect(result.topAccounts[0].name).toBe("Acme")
    expect(result.topAccounts[0].amount).toBe(130000)
    expect(result.topAccounts[1].name).toBe("Beta")
    expect(result.topAccounts[1].amount).toBe(5000)
  })

  it("folds monthly trends per created-month", async () => {
    setRpc({
      report_monthly_agg: [
        { month: "2026-02", currency: "USD", created_count: 3, won_count: 1, won_amount: 20000 },
        { month: "2026-01", currency: "USD", created_count: 2, won_count: 0, won_amount: 0 },
      ],
    })

    const { getReportData } = await import("../reports")
    const result = await getReportData(ctx)

    // Sorted ascending by month.
    expect(result.monthlyTrends.map((m) => m.month)).toEqual(["2026-01", "2026-02"])
    const feb = result.monthlyTrends.find((m) => m.month === "2026-02")
    expect(feb).toMatchObject({ created: 3, won: 1, amount: 20000 })
  })
})
