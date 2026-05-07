import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  accountFiltersSchema,
  accountCreateSchema,
  accountUpdateSchema,
} from "./accounts"

const mockSingle = vi.fn()
const mockEq = vi.fn()
const mockIlike = vi.fn()
const mockSelect = vi.fn()
const mockOrder = vi.fn()
const mockRange = vi.fn()
const mockNot = vi.fn()
const mockOr = vi.fn()
let mockInsert = vi.fn()
let mockUpdate = vi.fn()

function makeQueryBuilder(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    select: mockSelect,
    eq: mockEq,
    ilike: mockIlike,
    order: mockOrder,
    range: mockRange,
    not: mockNot,
    or: mockOr,
    single: mockSingle,
    insert: mockInsert,
    update: mockUpdate,
  }
}

function buildMockChain() {
  const qb = makeQueryBuilder()
  for (const key of Object.keys(qb)) {
    qb[key as keyof typeof qb].mockReturnValue(qb)
  }
  return qb
}

const mockFrom = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockInsert = vi.fn()
  mockUpdate = vi.fn()
  mockOr.mockReset()
  mockFrom.mockReturnValue(buildMockChain())
})

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock("server-only", () => ({}))

const defaultCtx = {
  user: { id: "user-1", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

const mockDbRecord = {
  id: "acct-1",
  name: "Acme Corp",
  legal_name: "Acme Corporation",
  website: "https://acme.com",
  country: "US",
  industry: "Technology",
  description: "A tech company",
  account_owner_user_id: "user-1",
  email_domains: ["acme.com"],
  custom_data: { tier: "platinum" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
  owner: { full_name: "Alice Johnson" },
}

const mockDbRecordNoOwner = {
  id: "acct-2",
  name: "Beta Inc",
  legal_name: null,
  website: null,
  country: "UK",
  industry: "Finance",
  description: null,
  account_owner_user_id: null,
  email_domains: null,
  custom_data: {},
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
  owner: null,
}




describe("accountFiltersSchema", () => {
  it("provides defaults for empty input", () => {
    const result = accountFiltersSchema.parse({})
    expect(result).toEqual({
      page: 1,
      pageSize: 20,
    })
  })

  it("accepts search query", () => {
    const result = accountFiltersSchema.parse({ q: "acme" })
    expect(result.q).toBe("acme")
  })

  it("rejects search query over 200 chars", () => {
    const result = accountFiltersSchema.safeParse({ q: "a".repeat(201) })
    expect(result.success).toBe(false)
  })

  it("accepts industry filter", () => {
    const result = accountFiltersSchema.parse({ industry: "Technology" })
    expect(result.industry).toBe("Technology")
  })

  it("coerces page from string", () => {
    const result = accountFiltersSchema.parse({ page: "3" })
    expect(result.page).toBe(3)
  })

  it("rejects page less than 1", () => {
    const result = accountFiltersSchema.safeParse({ page: 0 })
    expect(result.success).toBe(false)
  })

  it("rejects pageSize over 100", () => {
    const result = accountFiltersSchema.safeParse({ pageSize: 200 })
    expect(result.success).toBe(false)
  })
})

describe("getAccounts", () => {
  it("returns mapped accounts with pagination", async () => {
    mockRange.mockResolvedValueOnce({
      data: [mockDbRecord],
      error: null,
      count: 1,
    })

    const { getAccounts } = await import("./accounts")
    const result = await getAccounts(defaultCtx)

    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0].name).toBe("Acme Corp")
    expect(result.accounts[0].ownerName).toBe("Alice Johnson")
    expect(result.accounts[0].customData).toEqual({ tier: "platinum" })
    expect(result.totalCount).toBe(1)
    expect(result.totalPages).toBe(1)
    expect(result.page).toBe(1)
  })

  it("handles accounts without owner", async () => {
    mockRange.mockResolvedValueOnce({
      data: [mockDbRecordNoOwner],
      error: null,
      count: 1,
    })

    const { getAccounts } = await import("./accounts")
    const result = await getAccounts(defaultCtx)

    expect(result.accounts[0].ownerName).toBeNull()
    expect(result.accounts[0].legalName).toBeNull()
  })

  it("filters by search query", async () => {
    mockRange.mockResolvedValueOnce({
      data: [],
      error: null,
      count: 0,
    })

    const { getAccounts } = await import("./accounts")
    await getAccounts(defaultCtx, { q: "acme", page: 1, pageSize: 20 })

    expect(mockIlike).toHaveBeenCalledWith("name", "%acme%")
  })

  it("filters by industry", async () => {
    mockRange.mockResolvedValueOnce({
      data: [],
      error: null,
      count: 0,
    })

    const { getAccounts } = await import("./accounts")
    await getAccounts(defaultCtx, { industry: "Technology", page: 1, pageSize: 20 })

    expect(mockEq).toHaveBeenCalledWith("industry", "Technology")
  })

  it("applies correct range for pagination", async () => {
    mockRange.mockResolvedValueOnce({
      data: [],
      error: null,
      count: 0,
    })

    const { getAccounts } = await import("./accounts")
    await getAccounts(defaultCtx, { page: 3, pageSize: 10 })

    expect(mockRange).toHaveBeenCalledWith(20, 29)
  })

  it("returns empty list on empty table", async () => {
    mockRange.mockResolvedValueOnce({
      data: [],
      error: null,
      count: 0,
    })

    const { getAccounts } = await import("./accounts")
    const result = await getAccounts(defaultCtx)

    expect(result.accounts).toHaveLength(0)
    expect(result.totalCount).toBe(0)
    expect(result.totalPages).toBe(1)
  })

  it("throws on supabase error", async () => {
    mockRange.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
      count: null,
    })

    const { getAccounts } = await import("./accounts")
    await expect(getAccounts(defaultCtx)).rejects.toThrow("Failed to load accounts")
  })
})

describe("getAccountById", () => {
  it("returns account when found", async () => {
    mockSingle.mockResolvedValueOnce({ data: mockDbRecord, error: null })

    const { getAccountById } = await import("./accounts")
    const result = await getAccountById(defaultCtx, "acct-1")

    expect(result).not.toBeNull()
    expect(result!.name).toBe("Acme Corp")
    expect(result!.ownerName).toBe("Alice Johnson")
  })

  it("returns null when not found", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "Not found", code: "PGRST116", details: "", hint: "" },
    })

    const { getAccountById } = await import("./accounts")
    const result = await getAccountById(defaultCtx, "nonexistent")

    expect(result).toBeNull()
  })

  it("throws on unexpected errors", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "Connection refused", code: "ECONNREFUSED", details: "", hint: "" },
    })

    const { getAccountById } = await import("./accounts")

    await expect(getAccountById(defaultCtx, "acct-1")).rejects.toThrow("Failed to load account: Connection refused")
  })
})

describe("accountCreateSchema", () => {
  it("accepts valid create input", () => {
    const result = accountCreateSchema.safeParse({
      name: "Acme Corp",
      legalName: "Acme Corporation",
      website: "https://acme.com",
      country: "US",
      industry: "Technology",
      description: "A tech company",
      accountOwnerUserId: "00000000-0000-0000-0000-000000000001",
      emailDomains: "acme.com, acme-corp.com",
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty name", () => {
    const result = accountCreateSchema.safeParse({ name: "" })
    expect(result.success).toBe(false)
  })

  it("rejects invalid website", () => {
    const result = accountCreateSchema.safeParse({
      name: "Acme Corp",
      website: "not-a-url",
    })
    expect(result.success).toBe(false)
  })

  it("accepts minimal input", () => {
    const result = accountCreateSchema.safeParse({ name: "Acme Corp" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe("Acme Corp")
    }
  })

  it("accepts nullable fields as empty string", () => {
    const result = accountCreateSchema.safeParse({
      name: "Acme Corp",
      website: "",
      legalName: "",
    })
    expect(result.success).toBe(true)
  })

  it("rejects javascript: protocol URLs", () => {
    const result = accountCreateSchema.safeParse({
      name: "Acme Corp",
      website: "javascript:alert(1)",
    })
    expect(result.success).toBe(false)
  })

  it("rejects ftp:// protocol URLs", () => {
    const result = accountCreateSchema.safeParse({
      name: "Acme Corp",
      website: "ftp://example.com",
    })
    expect(result.success).toBe(false)
  })
})

describe("accountUpdateSchema", () => {
  it("accepts partial update input", () => {
    const result = accountUpdateSchema.safeParse({ name: "New Name" })
    expect(result.success).toBe(true)
  })

  it("accepts empty object", () => {
    const result = accountUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("rejects invalid website in update", () => {
    const result = accountUpdateSchema.safeParse({
      website: "not-a-url",
    })
    expect(result.success).toBe(false)
  })
})

describe("createAccount", () => {
  it("inserts and returns mapped account", async () => {
    mockSingle.mockResolvedValueOnce({ data: mockDbRecord, error: null })

    const { createAccount } = await import("./accounts")
    const result = await createAccount(defaultCtx, {
      name: "Acme Corp",
    })

    expect(mockInsert).toHaveBeenCalled()
    expect(result.name).toBe("Acme Corp")
    expect(result.ownerName).toBe("Alice Johnson")
  })

  it("throws on supabase error", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: new Error("Insert failed"),
    })

    const { createAccount } = await import("./accounts")
    await expect(
      createAccount(defaultCtx, { name: "Acme Corp" }),
    ).rejects.toThrow("Failed to create account")
  })

  it("rejects invalid input", async () => {
    const { createAccount } = await import("./accounts")
    await expect(
      createAccount(defaultCtx, { name: "" }),
    ).rejects.toThrow()
  })
})

describe("updateAccount", () => {
  it("updates and returns mapped account", async () => {
    mockSingle.mockResolvedValueOnce({ data: mockDbRecord, error: null })

    const { updateAccount } = await import("./accounts")
    const result = await updateAccount(defaultCtx, "acct-1", {
      name: "Acme Corp Updated",
    })

    expect(mockUpdate).toHaveBeenCalled()
    expect(result.name).toBe("Acme Corp")
  })

  it("throws on supabase error", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: new Error("Update failed"),
    })

    const { updateAccount } = await import("./accounts")
    await expect(
      updateAccount(defaultCtx, "acct-1", { name: "New Name" }),
    ).rejects.toThrow("Failed to update account")
  })

  it("returns existing account when no fields changed", async () => {
    mockSingle.mockResolvedValueOnce({ data: mockDbRecord, error: null })

    const { updateAccount } = await import("./accounts")
    const result = await updateAccount(defaultCtx, "acct-1", {})

    expect(result.name).toBe("Acme Corp")
  })

  it("rejects invalid input", async () => {
    const { updateAccount } = await import("./accounts")
    await expect(
      updateAccount(defaultCtx, "acct-1", { website: "bad" }),
    ).rejects.toThrow()
  })
})

describe("getAccountTree", () => {
  const mockRelRecord = {
    id: "rel-1",
    from_account_id: "acct-parent",
    to_account_id: "acct-1",
    kind: "subsidiary_of",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    from_account: { id: "acct-parent", name: "Parent Corp" },
    to_account: { id: "acct-1", name: "Acme Corp" },
  }

  it("returns tree data with focal account and edges", async () => {
    mockSingle.mockResolvedValueOnce({ data: mockDbRecord, error: null })
    mockOr.mockResolvedValueOnce({ data: [mockRelRecord], error: null })

    const { getAccountTree } = await import("./accounts")
    const result = await getAccountTree(defaultCtx, "acct-1")

    expect(result.focalAccount.name).toBe("Acme Corp")
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].relationship.kind).toBe("subsidiary_of")
    expect(result.edges[0].fromAccount.name).toBe("Parent Corp")
    expect(result.edges[0].toAccount.name).toBe("Acme Corp")
  })

  it("returns empty edges when no relationships exist", async () => {
    mockSingle.mockResolvedValueOnce({ data: mockDbRecord, error: null })
    mockOr.mockResolvedValueOnce({ data: [], error: null })

    const { getAccountTree } = await import("./accounts")
    const result = await getAccountTree(defaultCtx, "acct-1")

    expect(result.focalAccount.name).toBe("Acme Corp")
    expect(result.edges).toHaveLength(0)
  })

  it("throws when account not found", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "Not found", code: "PGRST116", details: "", hint: "" },
    })

    const { getAccountTree } = await import("./accounts")
    await expect(getAccountTree(defaultCtx, "nonexistent")).rejects.toThrow(
      "Account not found",
    )
  })

  it("throws on supabase error for relationships", async () => {
    mockSingle.mockResolvedValueOnce({ data: mockDbRecord, error: null })
    mockOr.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { getAccountTree } = await import("./accounts")
    await expect(getAccountTree(defaultCtx, "acct-1")).rejects.toThrow(
      "Failed to load account tree",
    )
  })

  it("maps from_account and to_account correctly", async () => {
    const rel = {
      ...mockRelRecord,
      from_account: { id: "acct-parent", name: "Parent Inc" },
      to_account: { id: "acct-1", name: "Acme Corp" },
    }
    mockSingle.mockResolvedValueOnce({ data: mockDbRecord, error: null })
    mockOr.mockResolvedValueOnce({ data: [rel], error: null })

    const { getAccountTree } = await import("./accounts")
    const result = await getAccountTree(defaultCtx, "acct-1")

    expect(result.edges[0].fromAccount.name).toBe("Parent Inc")
    expect(result.edges[0].toAccount.name).toBe("Acme Corp")
    expect(result.edges[0].fromAccount.id).toBe("acct-parent")
    expect(result.edges[0].toAccount.id).toBe("acct-1")
  })

  it("handles edges where focal account is from_account_id", async () => {
    const rel = {
      id: "rel-2",
      from_account_id: "acct-1",
      to_account_id: "acct-child",
      kind: "parent_of",
      notes: null,
      created_at: "2026-01-01T00:00:00Z",
      from_account: { id: "acct-1", name: "Acme Corp" },
      to_account: { id: "acct-child", name: "Child Ltd" },
    }
    mockSingle.mockResolvedValueOnce({ data: mockDbRecord, error: null })
    mockOr.mockResolvedValueOnce({ data: [rel], error: null })

    const { getAccountTree } = await import("./accounts")
    const result = await getAccountTree(defaultCtx, "acct-1")

    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].fromAccount.id).toBe("acct-1")
    expect(result.edges[0].toAccount.id).toBe("acct-child")
    expect(result.edges[0].relationship.kind).toBe("parent_of")
  })

  it("queries account_relationships with or filter", async () => {
    mockSingle.mockResolvedValueOnce({ data: mockDbRecord, error: null })
    mockOr.mockResolvedValueOnce({ data: [], error: null })

    const { getAccountTree } = await import("./accounts")
    await getAccountTree(defaultCtx, "acct-1")

    expect(mockOr).toHaveBeenCalledWith(
      "from_account_id.eq.acct-1,to_account_id.eq.acct-1",
    )
  })

  it("selects account relationships with joined account data", async () => {
    mockSingle.mockResolvedValueOnce({ data: mockDbRecord, error: null })
    mockOr.mockResolvedValueOnce({ data: [], error: null })

    const { getAccountTree } = await import("./accounts")
    await getAccountTree(defaultCtx, "acct-1")

    expect(mockSelect).toHaveBeenCalled()
    const selectArg = mockSelect.mock.calls.find(
      (c) => c[0] && typeof c[0] === "string" && c[0].includes("from_account"),
    )
    expect(selectArg).toBeDefined()
  })
})

describe("getAccountIndustries", () => {
  it("returns unique sorted industries", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        { industry: "Finance" },
        { industry: "Technology" },
        { industry: "Finance" },
        { industry: "Healthcare" },
      ],
      error: null,
    })

    const { getAccountIndustries } = await import("./accounts")
    const result = await getAccountIndustries(defaultCtx)

    expect(result).toEqual(["Finance", "Healthcare", "Technology"])
  })

  it("returns empty array when no industries", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [],
      error: null,
    })

    const { getAccountIndustries } = await import("./accounts")
    const result = await getAccountIndustries(defaultCtx)

    expect(result).toEqual([])
  })

  it("throws on supabase error", async () => {
    mockOrder.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { getAccountIndustries } = await import("./accounts")
    await expect(getAccountIndustries(defaultCtx)).rejects.toThrow("Failed to load industries")
  })
})
