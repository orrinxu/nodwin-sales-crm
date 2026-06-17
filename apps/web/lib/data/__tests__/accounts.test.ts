import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockSingle = vi.fn()
const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockIs = vi.fn()
const mockOr = vi.fn()
const mockOrder = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockIn = vi.fn()
const mockNot = vi.fn()

function chain(queryMethods: Record<string, unknown> = {}) {
  const self = {
    select: mockSelect,
    eq: mockEq,
    is: mockIs,
    or: mockOr,
    order: mockOrder,
    single: mockSingle,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    in: mockIn,
    not: mockNot,
    ...queryMethods,
  }
  return self
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

const defaultCtx = {
  user: { id: "user-1", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

const accountRow = (overrides: Record<string, unknown> = {}) => ({
  id: "acc-1",
  name: "Acme Corp",
  legal_name: null,
  website: "https://acme.com",
  country: "US",
  industry: "Technology",
  description: null,
  account_owner_user_id: "user-1",
  email_domains: ["acme.com"],
  custom_data: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
  created_by: "user-1",
  updated_by: "user-1",
  deleted_at: null,
  ...overrides,
})

function domainAccount(overrides: Record<string, unknown> = {}) {
  const row = accountRow(overrides)
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    website: row.website,
    country: row.country,
    industry: row.industry,
    description: row.description,
    accountOwnerUserId: row.account_owner_user_id,
    emailDomains: row.email_domains,
    customData: row.custom_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(chain())
  mockSelect.mockReturnValue(chain())
  mockEq.mockReturnValue(chain())
  mockIs.mockReturnValue(chain())
  mockOr.mockReturnValue(chain())
  mockOrder.mockReturnValue(chain())
  mockInsert.mockReturnValue(chain())
  mockUpdate.mockReturnValue(chain())
  mockDelete.mockReturnValue(chain())
  mockIn.mockReturnValue(chain())
  mockNot.mockReturnValue(chain())
})

describe("accountCreateSchema", () => {
  it("rejects empty name", async () => {
    const { accountCreateSchema } = await import("../accounts")
    const result = accountCreateSchema.safeParse({ name: "" })
    expect(result.success).toBe(false)
  })

  it("rejects non-URL website", async () => {
    const { accountCreateSchema } = await import("../accounts")
    const result = accountCreateSchema.safeParse({ name: "Acme", website: "not-a-url" })
    expect(result.success).toBe(false)
  })

  it("accepts valid URL website", async () => {
    const { accountCreateSchema } = await import("../accounts")
    const result = accountCreateSchema.safeParse({
      name: "Acme",
      website: "https://acme.com",
    })
    expect(result.success).toBe(true)
  })

  it("accepts minimal valid input", async () => {
    const { accountCreateSchema } = await import("../accounts")
    const result = accountCreateSchema.safeParse({ name: "Acme" })
    expect(result.success).toBe(true)
  })
})

describe("getAccountById", () => {
  it("returns domain account on success", async () => {
    mockSingle.mockResolvedValue({ data: accountRow(), error: null })

    const { getAccountById } = await import("../accounts")
    const result = await getAccountById(defaultCtx, "acc-1")

    expect(result).toEqual(domainAccount())
    expect(mockFrom).toHaveBeenCalledWith("accounts")
    expect(mockSelect).toHaveBeenCalledWith("*")
    expect(mockEq).toHaveBeenCalledWith("id", "acc-1")
    expect(mockIs).toHaveBeenCalledWith("deleted_at", null)
  })

  it("returns null for not-found (PGRST116)", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } })

    const { getAccountById } = await import("../accounts")
    const result = await getAccountById(defaultCtx, "acc-1")

    expect(result).toBeNull()
  })

  it("throws on other errors", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "boom", code: "OTHER" } })

    const { getAccountById } = await import("../accounts")
    await expect(getAccountById(defaultCtx, "acc-1")).rejects.toThrow("Failed to load account: boom")
  })
})

describe("getAccounts", () => {
  it("returns accounts with counts and owner name", async () => {
    const row = {
      ...accountRow(),
      owner: { full_name: "Alice" },
      contact_count: 3,
      opportunity_count: 2,
    }
    mockOrder.mockResolvedValue({ data: [row], error: null, count: 1 })

    const { getAccounts } = await import("../accounts")
    const result = await getAccounts(defaultCtx)

    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0].ownerName).toBe("Alice")
    expect(result.accounts[0].contactCount).toBe(3)
    expect(result.accounts[0].opportunityCount).toBe(2)
    expect(result.totalCount).toBe(1)
  })

  it("filters by query", async () => {
    mockOr.mockReturnValue(chain())
    mockOrder.mockResolvedValue({ data: [], error: null, count: 0 })

    const { getAccounts } = await import("../accounts")
    await getAccounts(defaultCtx, { query: "acme" })

    expect(mockOr).toHaveBeenCalled()
  })

  it("filters by industry", async () => {
    mockEq.mockReturnValue(chain({ is: mockIs }))
    mockIs.mockReturnValue(chain())
    mockOrder.mockResolvedValue({ data: [], error: null, count: 0 })

    const { getAccounts } = await import("../accounts")
    await getAccounts(defaultCtx, { industry: "Technology" })

    expect(mockEq).toHaveBeenCalled()
  })

  it("filters by ownerId", async () => {
    mockEq.mockReturnValue(chain({ is: mockIs }))
    mockIs.mockReturnValue(chain())
    mockOrder.mockResolvedValue({ data: [], error: null, count: 0 })

    const { getAccounts } = await import("../accounts")
    await getAccounts(defaultCtx, { ownerId: "user-1" })

    expect(mockEq).toHaveBeenCalled()
  })
})

describe("createAccount", () => {
  it("creates and returns domain account", async () => {
    mockInsert.mockReturnValue(chain({ select: mockSelect }))
    mockSingle.mockResolvedValue({ data: accountRow(), error: null })

    const { createAccount } = await import("../accounts")
    const result = await createAccount(defaultCtx, { name: "Acme Corp" })

    expect(result).toEqual(domainAccount())
    expect(mockFrom).toHaveBeenCalledWith("accounts")
  })
})

describe("updateAccount", () => {
  it("updates and returns domain account", async () => {
    mockSingle.mockResolvedValue({ data: accountRow({ name: "Updated" }), error: null })

    const { updateAccount } = await import("../accounts")
    const result = await updateAccount(defaultCtx, "acc-1", { name: "Updated" })

    expect(result.name).toBe("Updated")
  })
})

describe("softDeleteAccount", () => {
  it("sets deleted_at and returns domain account", async () => {
    const deletedRow = accountRow({ deleted_at: "2026-06-17T00:00:00Z" })
    mockSingle.mockResolvedValue({ data: deletedRow, error: null })

    const { softDeleteAccount } = await import("../accounts")
    const result = await softDeleteAccount(defaultCtx, "acc-1")

    expect(result.deletedAt).toBe("2026-06-17T00:00:00Z")
    expect(mockUpdate).toHaveBeenCalled()
  })

  it("throws on update error", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "not found" } })

    const { softDeleteAccount } = await import("../accounts")
    await expect(softDeleteAccount(defaultCtx, "acc-1")).rejects.toThrow(
      "Failed to soft-delete account: not found",
    )
  })
})

describe("bulkDeleteAccounts", () => {
  it("deletes multiple accounts", async () => {
    mockDelete.mockReturnValue(chain({ in: mockIn }))
    mockIn.mockResolvedValue({ error: null })

    const { bulkDeleteAccounts } = await import("../accounts")
    await expect(
      bulkDeleteAccounts(defaultCtx, { ids: ["acc-1", "acc-2"] }),
    ).resolves.toBeUndefined()
  })

  it("throws on error", async () => {
    mockDelete.mockReturnValue(chain({ in: mockIn }))
    mockIn.mockResolvedValue({ error: { message: "boom" } })

    const { bulkDeleteAccounts } = await import("../accounts")
    await expect(
      bulkDeleteAccounts(defaultCtx, { ids: ["acc-1"] }),
    ).rejects.toThrow("Failed to bulk delete accounts: boom")
  })
})

describe("getContactsForAccount", () => {
  it("returns deduplicated contacts from primary and linked sources", async () => {
    mockEq
      .mockResolvedValueOnce({
        data: [
          { id: "c-1", full_name: "Bob", title: "CEO", email: "bob@acme.com" },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null })

    const { getContactsForAccount } = await import("../accounts")
    const result = await getContactsForAccount(defaultCtx, "acc-1")

    expect(Array.isArray(result)).toBe(true)
  })
})

describe("getOpportunitiesForAccount", () => {
  it("returns opportunities for an account", async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          id: "opp-1", name: "Big Deal", stage: "qualify", amount: 10000,
          currency: "USD", close_date: null, probability_pct: 20,
        },
      ],
      error: null,
    })

    const { getOpportunitiesForAccount } = await import("../accounts")
    const result = await getOpportunitiesForAccount(defaultCtx, "acc-1")

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Big Deal")
    expect(result[0].stage).toBe("qualify")
    expect(result[0].amount).toBe(10000)
  })
})

describe("getIndustryOptions", () => {
  it("returns deduplicated industries excluding nulls", async () => {
    mockNot.mockReturnValue(chain({ is: mockIs }))
    mockIs.mockReturnValue(chain({ order: mockOrder }))
    mockOrder.mockResolvedValue({
      data: [
        { industry: "Technology" },
        { industry: "Technology" },
        { industry: "Finance" },
      ],
      error: null,
    })

    const { getIndustryOptions } = await import("../accounts")
    const result = await getIndustryOptions(defaultCtx)

    expect(result).toEqual(["Technology", "Finance"])
  })
})

describe("getOwnerOptions", () => {
  it("returns user list with names", async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: "user-1", full_name: "Alice", email: "alice@nodwin.com" },
        { id: "user-2", full_name: null, email: "bob@nodwin.com" },
      ],
      error: null,
    })

    const { getOwnerOptions } = await import("../accounts")
    const result = await getOwnerOptions(defaultCtx)

    expect(result).toEqual([
      { id: "user-1", name: "Alice" },
      { id: "user-2", name: "bob@nodwin.com" },
    ])
  })
})

describe("getAccountRelationshipGraph", () => {
  it("returns root node with inbound/outbound children", async () => {
    mockSelect.mockReturnValue(chain({ eq: mockEq }))
    mockEq.mockReturnValue(chain({ single: mockSingle }))

    mockSingle
      .mockResolvedValueOnce({ data: { id: "acc-1", name: "Acme" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })

    const { getAccountRelationshipGraph } = await import("../accounts")
    const result = await getAccountRelationshipGraph(defaultCtx, "acc-1")

    expect(result.root.id).toBe("acc-1")
    expect(result.root.accountName).toBe("Acme")
    expect(Array.isArray(result.root.children)).toBe(true)
  })
})

describe("getAccountLinkedOpportunities", () => {
  it("delegates to getOpportunitiesForAccount", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null })

    const { getAccountLinkedOpportunities } = await import("../accounts")
    const result = await getAccountLinkedOpportunities(defaultCtx, "acc-1")

    expect(Array.isArray(result)).toBe(true)
  })
})

describe("getAccountLinkedContacts", () => {
  it("delegates to getContactsForAccount", async () => {
    mockEq.mockResolvedValue({ data: [], error: null })

    const { getAccountLinkedContacts } = await import("../accounts")
    const result = await getAccountLinkedContacts(defaultCtx, "acc-1")

    expect(Array.isArray(result)).toBe(true)
  })
})

describe("getAccountLinkedDocuments", () => {
  it("returns documents linked to an account", async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          id: "doc-1",
          name: "Contract.pdf",
          mime_type: "application/pdf",
          category: "contract",
          uploaded_at: "2026-06-01T00:00:00Z",
          link_url: "https://drive.google.com/file/abc",
          drive_file_id: "abc123",
        },
      ],
      error: null,
    })

    const { getAccountLinkedDocuments } = await import("../accounts")
    const result = await getAccountLinkedDocuments(defaultCtx, "acc-1")

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Contract.pdf")
    expect(result[0].category).toBe("contract")
    expect(result[0].driveFileId).toBe("abc123")
  })
})

describe("getAccountOwnerOptions", () => {
  it("delegates to getOwnerOptions", async () => {
    mockOrder.mockResolvedValue({
      data: [{ id: "user-1", full_name: "Alice", email: "alice@nodwin.com" }],
      error: null,
    })

    const { getAccountOwnerOptions } = await import("../accounts")
    const result = await getAccountOwnerOptions(defaultCtx)

    expect(result).toEqual([{ id: "user-1", name: "Alice" }])
  })
})
