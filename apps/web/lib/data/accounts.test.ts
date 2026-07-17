import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockIs = vi.fn()
const mockOr = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockRange = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

const ctx = {
  user: { id: "u1", email: "a@nodwin.com", role: "admin" },
  source: "web" as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  // Chainable builder: select/is/or/eq/order return the builder; range() is
  // terminal (server-driven pagination — ORR-755).
  const builder = {
    select: mockSelect,
    is: mockIs,
    or: mockOr,
    eq: mockEq,
    order: mockOrder,
    range: mockRange,
  }
  mockFrom.mockReturnValue(builder)
  mockSelect.mockReturnValue(builder)
  mockIs.mockReturnValue(builder)
  mockOr.mockReturnValue(builder)
  mockEq.mockReturnValue(builder)
  mockOrder.mockReturnValue(builder)
  mockRange.mockResolvedValue({ data: [], error: null, count: 0 })
})

describe("getAccounts", () => {
  it("unwraps PostgREST [{count}] embeds into numeric counts", async () => {
    mockRange.mockResolvedValue({
      data: [
        {
          id: "acct-1",
          name: "Acme",
          account_owner_user_id: "u1",
          custom_data: {},
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          owner: { full_name: "Alice" },
          contact_count: [{ count: 3 }],
          opportunity_count: [{ count: 5 }],
        },
      ],
      error: null,
      count: 1,
    })

    const { getAccounts } = await import("./accounts")
    const { accounts } = await getAccounts(ctx)

    expect(accounts[0].contactCount).toBe(3)
    expect(accounts[0].opportunityCount).toBe(5)
    // Must be primitives, not the raw {count} object that 500'd the page.
    expect(typeof accounts[0].contactCount).toBe("number")
    expect(typeof accounts[0].opportunityCount).toBe("number")
  })

  it("defaults counts to 0 when the embed is empty or missing", async () => {
    mockRange.mockResolvedValue({
      data: [
        {
          id: "acct-2",
          name: "Beta",
          account_owner_user_id: null,
          custom_data: {},
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          owner: null,
          contact_count: [],
          opportunity_count: null,
        },
      ],
      error: null,
      count: 1,
    })

    const { getAccounts } = await import("./accounts")
    const { accounts } = await getAccounts(ctx)

    expect(accounts[0].contactCount).toBe(0)
    expect(accounts[0].opportunityCount).toBe(0)
  })
})
