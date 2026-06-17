import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

function buildQueryBuilder() {
  mockFrom.mockReturnValue({
    select: mockSelect,
  })
  mockSelect.mockReturnValue({
    order: mockOrder,
  })
  mockOrder.mockReturnValue({
    limit: mockLimit,
  })
  mockLimit.mockResolvedValue({ data: [], error: null })
  return { select: mockSelect, order: mockOrder, limit: mockLimit }
}

beforeEach(() => {
  vi.clearAllMocks()
  buildQueryBuilder()
})

describe("getReportData", () => {
  it("aggregates pipeline by stage correctly", async () => {
    const now = new Date().toISOString()
    mockLimit.mockResolvedValue({
      data: [
        {
          id: "1", name: "Deal 1", stage: "qualify", amount: 10000, currency: "INR",
          close_date: null, created_at: now, account: [{ name: "Acme" }],
        },
        {
          id: "2", name: "Deal 2", stage: "propose", amount: 50000, currency: "INR",
          close_date: null, created_at: now, account: [{ name: "Beta" }],
        },
        {
          id: "3", name: "Deal 3", stage: "closed_won", amount: 100000, currency: "INR",
          close_date: now, created_at: now, account: [{ name: "Acme" }],
        },
      ],
      error: null,
    })

    const { getReportData } = await import("../reports")
    const result = await getReportData()

    expect(result.pipelineByStage).toHaveLength(5)
    const qualify = result.pipelineByStage.find((s) => s.stage === "qualify")
    expect(qualify?.cents).toBe(1_000_000)
    expect(qualify?.count).toBe(1)

    const propose = result.pipelineByStage.find((s) => s.stage === "propose")
    expect(propose?.cents).toBe(5_000_000)

    expect(result.totalPipelineCents).toBe(6_000_000)
    expect(result.wonLostRevenue.find((r) => r.type === "won")?.cents).toBe(10_000_000)
    expect(result.winRate).toBe(100)
    expect(result.avgDealCents).toBe(10_000_000)
  })

  it("handles empty data", async () => {
    mockLimit.mockResolvedValue({ data: [], error: null })

    const { getReportData } = await import("../reports")
    const result = await getReportData()

    expect(result.pipelineByStage).toHaveLength(5)
    expect(result.totalPipelineCents).toBe(0)
    expect(result.totalWonCents).toBe(0)
    expect(result.avgDealCents).toBe(0)
    expect(result.winRate).toBe(0)
    expect(result.monthlyTrends).toEqual([])
    expect(result.topAccounts).toEqual([])
  })

  it("computes win rate correctly", async () => {
    const now = new Date().toISOString()
    mockLimit.mockResolvedValue({
      data: [
        {
          id: "1", name: "Won 1", stage: "closed_won", amount: 50000, currency: "INR",
          close_date: now, created_at: now, account: [{ name: "Acme" }],
        },
        {
          id: "2", name: "Lost 1", stage: "closed_lost", amount: 0, currency: "INR",
          close_date: now, created_at: now, account: [{ name: "Beta" }],
        },
        {
          id: "3", name: "Lost 2", stage: "closed_lost", amount: 0, currency: "INR",
          close_date: now, created_at: now, account: [{ name: "Gamma" }],
        },
      ],
      error: null,
    })

    const { getReportData } = await import("../reports")
    const result = await getReportData()

    expect(result.winRate).toBe(33)
    expect(result.totalWonCents).toBe(5_000_000)
  })

  it("ranks top accounts by revenue", async () => {
    const now = new Date().toISOString()
    mockLimit.mockResolvedValue({
      data: [
        {
          id: "1", name: "Big Deal", stage: "closed_won", amount: 100000, currency: "INR",
          close_date: now, created_at: now, account: [{ name: "Acme" }],
        },
        {
          id: "2", name: "Small Deal", stage: "closed_won", amount: 5000, currency: "INR",
          close_date: now, created_at: now, account: [{ name: "Beta" }],
        },
        {
          id: "3", name: "Medium Deal", stage: "closed_won", amount: 30000, currency: "INR",
          close_date: now, created_at: now, account: [{ name: "Acme" }],
        },
      ],
      error: null,
    })

    const { getReportData } = await import("../reports")
    const result = await getReportData()

    expect(result.topAccounts[0].name).toBe("Acme")
    expect(result.topAccounts[0].cents).toBe(13_000_000)
    expect(result.topAccounts[1].name).toBe("Beta")
    expect(result.topAccounts[1].cents).toBe(500_000)
  })
})
