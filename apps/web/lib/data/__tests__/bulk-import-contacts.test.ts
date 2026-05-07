import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ContactCreateInput } from "../contacts"

const mockInsert = vi.fn()
const mockFrom = vi.fn()
const mockRequireUser = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue({ insert: mockInsert })
})

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock("@/lib/security/auth", () => ({
  requireUser: mockRequireUser,
}))

vi.mock("server-only", () => ({}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

const defaultCtx = {
  user: { id: "user-1", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

describe("bulkCreateContacts", () => {
  it("inserts all valid rows and returns success count", async () => {
    mockInsert.mockResolvedValueOnce({ error: null })
    mockInsert.mockResolvedValueOnce({ error: null })
    mockInsert.mockResolvedValueOnce({ error: null })

    const { bulkCreateContacts } = await import("../contacts")
    const rows: ContactCreateInput[] = [
      { fullName: "Alice" },
      { fullName: "Bob", email: "bob@test.com" },
      { fullName: "Charlie", title: "CEO" },
    ]

    const result = await bulkCreateContacts(defaultCtx, rows)
    expect(result.successCount).toBe(3)
    expect(result.errorCount).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(mockInsert).toHaveBeenCalledTimes(3)
  })

  it("returns per-row validation errors for invalid rows", async () => {
    const { bulkCreateContacts } = await import("../contacts")
    const rows: ContactCreateInput[] = [
      { fullName: "Alice" },
      { fullName: "" },
      { fullName: "Bob" },
    ]

    mockInsert.mockResolvedValueOnce({ error: null })
    mockInsert.mockResolvedValueOnce({ error: null })

    const result = await bulkCreateContacts(defaultCtx, rows)
    expect(result.successCount).toBe(2)
    expect(result.errorCount).toBe(1)
    expect(result.errors[0].row).toBe(2)
    expect(result.errors[0].message).toContain("Full name is required")
  })

  it("reports database insert errors per row", async () => {
    mockInsert.mockResolvedValueOnce({ error: null })
    mockInsert.mockResolvedValueOnce({ error: new Error("DB constraint violation") })

    const { bulkCreateContacts } = await import("../contacts")
    const rows: ContactCreateInput[] = [
      { fullName: "Alice" },
      { fullName: "Bob" },
    ]

    const result = await bulkCreateContacts(defaultCtx, rows)
    expect(result.successCount).toBe(1)
    expect(result.errorCount).toBe(1)
    expect(result.errors[0].message).toBe("DB constraint violation")
  })

  it("handles empty array", async () => {
    const { bulkCreateContacts } = await import("../contacts")
    const result = await bulkCreateContacts(defaultCtx, [])
    expect(result.successCount).toBe(0)
    expect(result.errorCount).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it("validates email format", async () => {
    const { bulkCreateContacts } = await import("../contacts")
    const rows: ContactCreateInput[] = [
      { fullName: "Alice", email: "not-an-email" },
      { fullName: "Bob", email: "bob@test.com" },
    ]

    mockInsert.mockResolvedValueOnce({ error: null })

    const result = await bulkCreateContacts(defaultCtx, rows)
    expect(result.successCount).toBe(1)
    expect(result.errorCount).toBe(1)
    expect(result.errors[0].message).toContain("email")
  })
})

describe("bulkImportContactsAction", () => {
  beforeEach(() => {
    mockRequireUser.mockResolvedValue({ id: "user-1", email: "alice@nodwin.com", role: "admin" })
  })

  it("calls requireUser and returns result", async () => {
    mockInsert.mockResolvedValue({ error: null })

    const { bulkImportContactsAction } = await import("@/app/(crm)/contacts/actions")
    const rows: ContactCreateInput[] = [{ fullName: "Alice" }, { fullName: "Bob" }]

    const result = await bulkImportContactsAction(rows)
    expect(mockRequireUser).toHaveBeenCalledOnce()
    expect(result.successCount).toBe(2)
    expect(result.errorCount).toBe(0)
  })

  it("rejects rows exceeding the limit", async () => {
    const { bulkImportContactsAction } = await import("@/app/(crm)/contacts/actions")
    const rows: ContactCreateInput[] = Array.from({ length: 1001 }, (_, i) => ({
      fullName: `User ${i}`,
    }))

    const result = await bulkImportContactsAction(rows)
    expect(mockRequireUser).not.toHaveBeenCalled()
    expect(result.successCount).toBe(0)
    expect(result.errorCount).toBe(1001)
    expect(result.errors[0].message).toContain("Row limit exceeded")
  })

  it("accepts rows at exactly the limit", async () => {
    mockInsert.mockResolvedValue({ error: null })

    const { bulkImportContactsAction } = await import("@/app/(crm)/contacts/actions")
    const rows: ContactCreateInput[] = Array.from({ length: 1000 }, (_, i) => ({
      fullName: `User ${i}`,
    }))

    const result = await bulkImportContactsAction(rows)
    expect(mockRequireUser).toHaveBeenCalledOnce()
    expect(result.successCount).toBe(1000)
  })
})
