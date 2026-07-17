import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockEq = vi.fn()
const mockGte = vi.fn()
const mockLte = vi.fn()
const mockIs = vi.fn()
const mockIlike = vi.fn()
const mockOr = vi.fn()
const mockOrder = vi.fn()
const mockRange = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockRpc = vi.fn()

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
  // select()/eq()/gte()/lte()/is()/ilike()/or()/order() return the chainable
  // builder; range() is terminal (server-driven pagination — ORR-755).
  const builder = {
    select: mockSelect,
    eq: mockEq,
    gte: mockGte,
    lte: mockLte,
    is: mockIs,
    ilike: mockIlike,
    or: mockOr,
    order: mockOrder,
    range: mockRange,
  }
  mockSelect.mockReturnValue(builder)
  mockEq.mockReturnValue(builder)
  mockGte.mockReturnValue(builder)
  mockLte.mockReturnValue(builder)
  mockIs.mockReturnValue(builder)
  mockIlike.mockReturnValue(builder)
  mockOr.mockReturnValue(builder)
  mockOrder.mockReturnValue(builder)
  mockRange.mockResolvedValue({ data: [mockDbRow], error: null, count: 1 })
  mockFrom.mockReturnValue(builder)
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
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

  it("entityId narrows to a single selling entity via entity_sales_id", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, { scope: "all", entityId: "ent-1" })

    // A single-value `.eq` on entity_sales_id — pure narrowing on top of RLS,
    // structurally a subset of the unfiltered All Deals list.
    expect(mockEq).toHaveBeenCalledWith("entity_sales_id", "ent-1")
  })

  it("does not filter on entity_sales_id when no entityId is given", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, { scope: "all" })

    expect(mockEq).not.toHaveBeenCalledWith("entity_sales_id", expect.anything())
  })

  it("applies a stage filter via .eq('stage', …)", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, { scope: "all", stageFilter: "propose" })
    expect(mockEq).toHaveBeenCalledWith("stage", "propose")
  })

  it("ignores a stage filter of 'all'", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, { scope: "all", stageFilter: "all" })
    expect(mockEq).not.toHaveBeenCalledWith("stage", expect.anything())
  })

  it("maps the unassigned owner sentinel to IS NULL", async () => {
    const { getOpportunities, OPPORTUNITY_UNASSIGNED_OWNER } = await import(
      "../opportunities"
    )
    await getOpportunities(defaultCtx, {
      scope: "all",
      ownerFilter: OPPORTUNITY_UNASSIGNED_OWNER,
    })
    expect(mockIs).toHaveBeenCalledWith("owner_user_id", null)
  })

  it("defaults to the first page range (0–24) at the default page size", async () => {
    const { getOpportunities } = await import("../opportunities")
    const result = await getOpportunities(defaultCtx, { scope: "all" })
    expect(mockRange).toHaveBeenCalledWith(0, 24)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(25)
  })

  it("offsets the range for a later page", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, { scope: "all", page: 3, pageSize: 10 })
    expect(mockRange).toHaveBeenCalledWith(20, 29)
  })
})

describe("getEntityScopeOptions", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("derives options from list_visible_sales_entities (RLS-scoped RPC)", async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: "ent-1", name: "Nodwin Gaming" },
        { id: "ent-2", name: "NODWIN MEA" },
      ],
      error: null,
    })
    const { getEntityScopeOptions } = await import("../opportunities")
    const options = await getEntityScopeOptions(defaultCtx)

    expect(mockRpc).toHaveBeenCalledWith("list_visible_sales_entities")
    expect(options).toEqual([
      { id: "ent-1", name: "Nodwin Gaming" },
      { id: "ent-2", name: "NODWIN MEA" },
    ])
  })

  it("returns an empty list when the caller sees no entity-tagged deals", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const { getEntityScopeOptions } = await import("../opportunities")
    expect(await getEntityScopeOptions(defaultCtx)).toEqual([])
  })

  it("throws when the RPC errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } })
    const { getEntityScopeOptions } = await import("../opportunities")
    await expect(getEntityScopeOptions(defaultCtx)).rejects.toThrow(/boom/)
  })
})
