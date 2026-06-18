import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockCurrenciesIn = vi.fn()
const mockCurrenciesSelect = vi.fn()
const mockStageEq = vi.fn()
const mockStageOrder = vi.fn()
const mockStageSelect = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

function buildQueryBuilder() {
  mockCurrenciesIn.mockResolvedValue({
    data: [{ code: "USD", scale: 2 }],
    error: null,
  })
  mockCurrenciesSelect.mockReturnValue({ in: mockCurrenciesIn })
  mockStageEq.mockReturnValue({ order: mockStageOrder })
  mockStageOrder.mockResolvedValue({
    data: [
      { key: "qualify", label: "Qualify" },
      { key: "meet_and_present", label: "Meet & Present" },
      { key: "propose", label: "Propose" },
      { key: "negotiate", label: "Negotiate" },
      { key: "verbal_agreement", label: "Verbal Agreement" },
      { key: "closed_won", label: "Closed Won" },
      { key: "closed_lost", label: "Closed Lost" },
    ],
    error: null,
  })
  mockStageSelect.mockReturnValue({ eq: mockStageEq })
  mockFrom.mockImplementation((table: string) => {
    if (table === "currencies") {
      return { select: mockCurrenciesSelect }
    }
    if (table === "pipeline_stages") {
      return { select: mockStageSelect }
    }
    return { select: mockSelect }
  })
  mockSelect.mockReturnValue({
    order: mockOrder,
  })
  mockOrder.mockReturnValue({
    limit: mockLimit,
  })
  mockLimit.mockResolvedValue({ data: [], error: null })
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
          id: "1", name: "Deal 1", stage: "qualify", amount: 10000, currency: "USD",
          close_date: null, created_at: now, account: [{ name: "Acme" }],
        },
        {
          id: "2", name: "Deal 2", stage: "propose", amount: 50000, currency: "USD",
          close_date: null, created_at: now, account: [{ name: "Beta" }],
        },
        {
          id: "3", name: "Deal 3", stage: "closed_won", amount: 100000, currency: "USD",
          close_date: now, created_at: now, account: [{ name: "Acme" }],
        },
      ],
      error: null,
    })

    const { getReportData } = await import("../reports")
    const result = await getReportData()

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
    mockLimit.mockResolvedValue({ data: [], error: null })

    const { getReportData } = await import("../reports")
    const result = await getReportData()

    expect(result.pipelineByStage).toHaveLength(5)
    expect(result.totalPipeline).toBe(0)
    expect(result.totalWon).toBe(0)
    expect(result.avgDealSize).toBe(0)
    expect(result.winRate).toBe(0)
    expect(result.monthlyTrends).toEqual([])
    expect(result.topAccounts).toEqual([])
  })

  it("computes win rate correctly", async () => {
    const now = new Date().toISOString()
    mockLimit.mockResolvedValue({
      data: [
        {
          id: "1", name: "Won 1", stage: "closed_won", amount: 50000, currency: "USD",
          close_date: now, created_at: now, account: [{ name: "Acme" }],
        },
        {
          id: "2", name: "Lost 1", stage: "closed_lost", amount: 0, currency: "USD",
          close_date: now, created_at: now, account: [{ name: "Beta" }],
        },
        {
          id: "3", name: "Lost 2", stage: "closed_lost", amount: 0, currency: "USD",
          close_date: now, created_at: now, account: [{ name: "Gamma" }],
        },
      ],
      error: null,
    })

    const { getReportData } = await import("../reports")
    const result = await getReportData()

    expect(result.winRate).toBe(33)
    expect(result.totalWon).toBe(50000)
  })

  it("ranks top accounts by revenue", async () => {
    const now = new Date().toISOString()
    mockLimit.mockResolvedValue({
      data: [
        {
          id: "1", name: "Big Deal", stage: "closed_won", amount: 100000, currency: "USD",
          close_date: now, created_at: now, account: [{ name: "Acme" }],
        },
        {
          id: "2", name: "Small Deal", stage: "closed_won", amount: 5000, currency: "USD",
          close_date: now, created_at: now, account: [{ name: "Beta" }],
        },
        {
          id: "3", name: "Medium Deal", stage: "closed_won", amount: 30000, currency: "USD",
          close_date: now, created_at: now, account: [{ name: "Acme" }],
        },
      ],
      error: null,
    })

    const { getReportData } = await import("../reports")
    const result = await getReportData()

    expect(result.topAccounts[0].name).toBe("Acme")
    expect(result.topAccounts[0].amount).toBe(130000)
    expect(result.topAccounts[1].name).toBe("Beta")
    expect(result.topAccounts[1].amount).toBe(5000)
  })
})
