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

  it("clamps a normal list to MAX_PAGE_SIZE even when a larger pageSize is asked (ORR-805)", async () => {
    const { getOpportunities } = await import("../opportunities")
    const { BOARD_FETCH_CAP, MAX_PAGE_SIZE } = await import("@/lib/list/pagination")
    // No maxPageSize → the default 100 ceiling still holds, so an over-large
    // pageSize can never re-introduce the unbounded fetch.
    const result = await getOpportunities(defaultCtx, {
      scope: "all",
      pageSize: BOARD_FETCH_CAP,
    })
    expect(mockRange).toHaveBeenCalledWith(0, MAX_PAGE_SIZE - 1)
    expect(result.pageSize).toBe(MAX_PAGE_SIZE)
  })

  it("lets the board fetch up to BOARD_FETCH_CAP when maxPageSize opts in (ORR-805)", async () => {
    const { getOpportunities } = await import("../opportunities")
    const { BOARD_FETCH_CAP } = await import("@/lib/list/pagination")
    // The board path passes pageSize AND maxPageSize = BOARD_FETCH_CAP; the 500
    // must survive the clamp end-to-end (clampPageSize + rangeFor re-clamp).
    const result = await getOpportunities(defaultCtx, {
      scope: "all",
      page: 1,
      pageSize: BOARD_FETCH_CAP,
      maxPageSize: BOARD_FETCH_CAP,
    })
    expect(mockRange).toHaveBeenCalledWith(0, BOARD_FETCH_CAP - 1)
    expect(result.pageSize).toBe(BOARD_FETCH_CAP)
  })

  it("clamps an over-large maxPageSize to BOARD_FETCH_CAP (ORR-805)", async () => {
    const { getOpportunities } = await import("../opportunities")
    const { BOARD_FETCH_CAP } = await import("@/lib/list/pagination")
    const result = await getOpportunities(defaultCtx, {
      scope: "all",
      pageSize: 100000,
      maxPageSize: 100000,
    })
    expect(mockRange).toHaveBeenCalledWith(0, BOARD_FETCH_CAP - 1)
    expect(result.pageSize).toBe(BOARD_FETCH_CAP)
  })
})

describe("getOpportunities — sort (ORR-800)", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    buildBuilder()
  })

  it("NEVER promotes the account/owner embed to !inner (would drop RLS-hidden joins)", async () => {
    const { getOpportunities } = await import("../opportunities")
    // Sorting by account/owner must not switch the embed to an inner join —
    // accounts/users RLS is narrower than opportunity visibility, so !inner would
    // silently drop deals whose account/owner row the caller can't SELECT.
    for (const column of ["account", "owner"] as const) {
      vi.resetAllMocks()
      buildBuilder()
      await getOpportunities(defaultCtx, {
        scope: "all",
        sort: { column, direction: "asc" },
      })
      const selectArg = mockSelect.mock.calls[0][0] as string
      expect(selectArg).not.toContain("!inner")
      // The embeds stay LEFT joins, so display still degrades to null under RLS.
      expect(selectArg).toContain("account:account_id ( name )")
      expect(selectArg).toContain("owner:owner_user_id ( full_name )")
    }
  })

  it("sorts by Account on the denormalized top-level account_name column", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, {
      scope: "all",
      sort: { column: "account", direction: "asc" },
    })
    // Denormalized column lives ON the opportunity row (RLS already lets you read
    // it), so ordering + pagination can't drop a visible deal.
    expect(mockOrder).toHaveBeenCalledWith("account_name", {
      ascending: true,
      nullsFirst: false,
    })
    // Stable tiebreaker so .range() pagination can't duplicate/skip ties.
    expect(mockOrder).toHaveBeenCalledWith("id", { ascending: true })
    // Guard the old no-op form is gone.
    expect(mockOrder).not.toHaveBeenCalledWith(
      "name",
      expect.objectContaining({ referencedTable: "account" }),
    )
  })

  it("sorts by Owner on the denormalized top-level owner_name column", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, {
      scope: "all",
      sort: { column: "owner", direction: "desc" },
    })
    expect(mockOrder).toHaveBeenCalledWith("owner_name", {
      ascending: false,
      nullsFirst: false,
    })
    expect(mockOrder).toHaveBeenCalledWith("id", { ascending: true })
    expect(mockOrder).not.toHaveBeenCalledWith(
      "full_name",
      expect.objectContaining({ referencedTable: "owner" }),
    )
  })

  it("selects the denormalized sort columns", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, { scope: "all" })
    const selectArg = mockSelect.mock.calls[0][0] as string
    expect(selectArg).toContain("account_name")
    expect(selectArg).toContain("owner_name")
  })

  it("appends the id tiebreaker on a working top-level sort column", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, {
      scope: "all",
      sort: { column: "amount", direction: "desc" },
    })
    expect(mockOrder).toHaveBeenCalledWith("amount", { ascending: false })
    expect(mockOrder).toHaveBeenCalledWith("id", { ascending: true })
  })

  it("appends the id tiebreaker on the default (updated_at) sort", async () => {
    const { getOpportunities } = await import("../opportunities")
    await getOpportunities(defaultCtx, { scope: "all" })
    expect(mockOrder).toHaveBeenCalledWith("updated_at", { ascending: false })
    expect(mockOrder).toHaveBeenCalledWith("id", { ascending: true })
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
