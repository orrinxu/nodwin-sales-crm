import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockRpc = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ rpc: mockRpc })),
}))

const ctx = {
  user: { id: "user-1", email: "a@nodwin.com", role: "sales_manager" },
  source: "web" as const,
}

describe("getConversionFunnel", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRpc.mockResolvedValue({
      data: [
        { stage: "qualify", deal_count: 10 },
        { stage: "propose", deal_count: 4 },
      ],
      error: null,
    })
  })

  it("defaults to the org/RLS-scoped funnel (p_team_only false)", async () => {
    const { getConversionFunnel } = await import("./conversion")
    await getConversionFunnel(ctx)
    expect(mockRpc).toHaveBeenCalledWith("conversion_funnel_agg", {
      p_team_only: false,
    })
  })

  it("narrows to the caller's reporting subtree when teamOnly is set", async () => {
    const { getConversionFunnel } = await import("./conversion")
    await getConversionFunnel(ctx, { teamOnly: true })
    expect(mockRpc).toHaveBeenCalledWith("conversion_funnel_agg", {
      p_team_only: true,
    })
  })

  it("builds the funnel from the per-stage counts", async () => {
    const { getConversionFunnel } = await import("./conversion")
    const funnel = await getConversionFunnel(ctx, { teamOnly: true })
    // buildConversionFunnel derives the cumulative series; the first stage's
    // reached count is the raw count for that stage.
    expect(funnel.stages.length).toBeGreaterThan(0)
  })

  it("throws when the RPC errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } })
    const { getConversionFunnel } = await import("./conversion")
    await expect(getConversionFunnel(ctx)).rejects.toThrow(/boom/)
  })
})
