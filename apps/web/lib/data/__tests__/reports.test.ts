import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

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
  mockFrom.mockReturnValue({
    select: vi.fn().mockResolvedValue({
      data: returnData,
      error: error ?? null,
    }),
  })
}

describe("getPipelineSummary", () => {
  it("returns empty stages when there is no data", async () => {
    buildQuery([])
    const { getPipelineSummary } = await import("../reports")
    const result = await getPipelineSummary(defaultCtx)

    expect(result.totalCount).toBe(0)
    expect(result.totalAmount).toBe("0.00")
    expect(result.stages).toHaveLength(7)
    for (const stage of result.stages) {
      expect(stage.count).toBe(0)
      expect(stage.totalAmount).toBe("0.00")
    }
  })

  it("aggregates opportunities by stage", async () => {
    buildQuery([
      { stage: "qualify", amount: 10000, currency: "USD" },
      { stage: "qualify", amount: 5000, currency: "USD" },
      { stage: "closed_won", amount: 25000, currency: "USD" },
    ])
    const { getPipelineSummary } = await import("../reports")
    const result = await getPipelineSummary(defaultCtx)

    expect(result.totalCount).toBe(3)
    expect(result.totalAmount).toBe("40000.00")

    const qualify = result.stages.find((s) => s.stage === "qualify")
    expect(qualify?.count).toBe(2)
    expect(qualify?.totalAmount).toBe("15000.00")

    const closedWon = result.stages.find((s) => s.stage === "closed_won")
    expect(closedWon?.count).toBe(1)
    expect(closedWon?.totalAmount).toBe("25000.00")
  })

  it("handles null/undefined amount gracefully", async () => {
    buildQuery([
      { stage: "propose", amount: null, currency: "USD" },
    ])
    const { getPipelineSummary } = await import("../reports")
    const result = await getPipelineSummary(defaultCtx)

    const propose = result.stages.find((s) => s.stage === "propose")
    expect(propose?.count).toBe(1)
    expect(propose?.totalAmount).toBe("0.00")
  })

  it("throws on supabase error", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Connection refused" },
      }),
    })

    const { getPipelineSummary } = await import("../reports")
    await expect(getPipelineSummary(defaultCtx)).rejects.toThrow(
      "Failed to load pipeline report data: Connection refused",
    )
  })
})
