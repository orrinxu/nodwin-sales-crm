import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockRpc = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ rpc: mockRpc })),
}))

const ctx = {
  user: { id: "mgr-1", email: "mgr@nodwin.com", role: "sales_manager" },
  source: "web" as const,
}

describe("getTeamScope", () => {
  beforeEach(() => vi.resetAllMocks())

  it("resolves the subtree from team_member_ids seeded with the caller", async () => {
    mockRpc.mockResolvedValue({ data: ["mgr-1", "rep-1", "rep-2"], error: null })
    const { getTeamScope } = await import("./team")
    const scope = await getTeamScope(ctx)

    expect(mockRpc).toHaveBeenCalledWith("team_member_ids", { _root: "mgr-1" })
    expect(scope.memberIds).toEqual(["mgr-1", "rep-1", "rep-2"])
    expect(scope.hasReports).toBe(true)
  })

  it("hasReports is false when the subtree is only the caller (no reports)", async () => {
    mockRpc.mockResolvedValue({ data: ["mgr-1"], error: null })
    const { getTeamScope } = await import("./team")
    const scope = await getTeamScope(ctx)
    expect(scope.hasReports).toBe(false)
  })

  it("hasReports is false for an empty result", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const { getTeamScope } = await import("./team")
    expect((await getTeamScope(ctx)).hasReports).toBe(false)
  })

  it("throws when the RPC errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } })
    const { getTeamScope } = await import("./team")
    await expect(getTeamScope(ctx)).rejects.toThrow(/boom/)
  })
})
