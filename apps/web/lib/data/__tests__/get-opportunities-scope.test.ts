import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockEq = vi.fn()
const mockGte = vi.fn()
const mockLte = vi.fn()
const mockOrder = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()

// A minimal DB row — toDomainOpportunity fills the rest with fallbacks.
const mockDbRow = {
  id: "opp-1",
  name: "Big Deal",
  account_id: "acct-1",
  stage: "propose",
  amount: "1000",
  currency: "USD",
  owner_user_id: "user-1",
  sales_unit_id: "bu-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
  account: { name: "Acme Corp" },
  owner: { full_name: "Alice" },
}

function buildBuilder() {
  // select()/eq()/gte()/lte() return the chainable builder; order() is terminal.
  const builder = {
    select: mockSelect,
    eq: mockEq,
    gte: mockGte,
    lte: mockLte,
    order: mockOrder,
  }
  mockSelect.mockReturnValue(builder)
  mockEq.mockReturnValue(builder)
  mockGte.mockReturnValue(builder)
  mockLte.mockReturnValue(builder)
  mockOrder.mockResolvedValue({ data: [mockDbRow], error: null, count: 1 })
  mockFrom.mockReturnValue(builder)
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

const defaultCtx = {
  user: { id: "user-1", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

describe("getOpportunities — owner scope filter", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    buildBuilder()
  })

  it('scope="mine" narrows to the current user via owner_user_id', async () => {
    const { getOpportunities } = await import("../opportunities")
    const result = await getOpportunities(defaultCtx, { scope: "mine" })

    expect(mockEq).toHaveBeenCalledWith("owner_user_id", "user-1")
    expect(result.opportunities).toHaveLength(1)
    expect(result.totalCount).toBe(1)
  })

  it('scope="all" does NOT add an owner filter', async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, { scope: "all" })

    expect(mockEq).not.toHaveBeenCalledWith("owner_user_id", expect.anything())
  })

  it("defaults to the org-wide list (no owner filter) when no scope is given", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx)

    expect(mockEq).not.toHaveBeenCalledWith("owner_user_id", expect.anything())
  })

  it("applies an inclusive close_date window when closeDateFrom/To are given", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, {
      scope: "all",
      closeDateFrom: "2026-07-01",
      closeDateTo: "2026-07-31",
    })

    expect(mockGte).toHaveBeenCalledWith("close_date", "2026-07-01")
    expect(mockLte).toHaveBeenCalledWith("close_date", "2026-07-31")
  })

  it("does not filter on close_date when no window is given", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, { scope: "all" })

    expect(mockGte).not.toHaveBeenCalled()
    expect(mockLte).not.toHaveBeenCalled()
  })
})
