import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/security/env", () => ({
  env: {
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "svc-key",
    SUPABASE_ANON_KEY: "anon-key",
    NODE_ENV: "test",
    NEXT_PUBLIC_ENV: "test",
  },
}))

type Result = { data: unknown; error: unknown }
const userResults = new Map<string, Result>()

const insertSpy = vi.fn()
const updateSpy = vi.fn()
const upsertSpy = vi.fn()

function builder(result: Result, table: string) {
  const chainCalls: Array<{ method: string; args: unknown[] }> = []
  const b = {
    select: () => b,
    insert: (payload: unknown) => {
      insertSpy(table, payload)
      chainCalls.push({ method: "insert", args: [payload] })
      return b
    },
    update: (payload: unknown) => {
      updateSpy(table, payload)
      chainCalls.push({ method: "update", args: [payload] })
      return b
    },
    upsert: (payload: unknown) => {
      upsertSpy(table, payload)
      chainCalls.push({ method: "upsert", args: [payload] })
      return b
    },
    delete: () => b,
    eq: () => b,
    order: () => b,
    single: () => Promise.resolve(result),
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR),
  }
  return b
}

const NO_ROW: Result = { data: null, error: null }
const userClient = {
  from: (table: string) =>
    builder(userResults.get(table) ?? NO_ROW, table),
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => userClient),
}))

const ctx = {
  user: { id: "u1", email: "admin@nodwin.com", role: "admin" },
  source: "web" as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  userResults.clear()
})

function makeCategory(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    code: "rfp",
    label: "RFP",
    description: "Request for Proposal",
    active: true,
    display_order: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    updated_by: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    ...overrides,
  }
}

describe("getFileTypeCategories", () => {
  it("returns active categories ordered by display_order", async () => {
    userResults.set("file_type_categories", {
      data: [makeCategory({ code: "rfp", display_order: 1 }), makeCategory({ code: "other", display_order: 99 })],
      error: null,
    })
    const { getFileTypeCategories } = await import("./file-type-categories")
    const result = await getFileTypeCategories()
    expect(result).toHaveLength(2)
    expect(result[0].code).toBe("rfp")
    expect(result[1].code).toBe("other")
  })

  it("returns empty array when no active categories exist", async () => {
    userResults.set("file_type_categories", { data: [], error: null })
    const { getFileTypeCategories } = await import("./file-type-categories")
    const result = await getFileTypeCategories()
    expect(result).toHaveLength(0)
  })

  it("throws on DB error", async () => {
    userResults.set("file_type_categories", {
      data: null,
      error: { message: "db down" },
    })
    const { getFileTypeCategories } = await import("./file-type-categories")
    await expect(getFileTypeCategories()).rejects.toThrow(
      "Failed to load file type categories: db down",
    )
  })
})

describe("getAllFileTypeCategories", () => {
  it("returns all categories including inactive", async () => {
    userResults.set("file_type_categories", {
      data: [
        makeCategory({ code: "rfp", active: true }),
        makeCategory({ code: "old", active: false, display_order: 50 }),
      ],
      error: null,
    })
    const { getAllFileTypeCategories } = await import("./file-type-categories")
    const result = await getAllFileTypeCategories()
    expect(result).toHaveLength(2)
  })
})

describe("createFileTypeCategory", () => {
  it("creates and returns a new category", async () => {
    userResults.set("file_type_categories", {
      data: makeCategory({ code: "new_cat", label: "New Cat" }),
      error: null,
    })
    const { createFileTypeCategory } = await import("./file-type-categories")
    const result = await createFileTypeCategory(ctx, {
      code: "new_cat",
      label: "New Cat",
      displayOrder: 5,
    })
    expect(result.code).toBe("new_cat")
    expect(insertSpy).toHaveBeenCalled()
  })

  it("rejects invalid code (uppercase)", async () => {
    const { createFileTypeCategory } = await import("./file-type-categories")
    await expect(
      createFileTypeCategory(ctx, { code: "Invalid", label: "X", displayOrder: 0 }),
    ).rejects.toThrow()
  })

  it("rejects empty code", async () => {
    const { createFileTypeCategory } = await import("./file-type-categories")
    await expect(
      createFileTypeCategory(ctx, { code: "", label: "X", displayOrder: 0 }),
    ).rejects.toThrow()
  })
})

describe("updateFileTypeCategory", () => {
  it("updates label and active fields", async () => {
    userResults.set("file_type_categories", {
      data: null,
      error: null,
    })
    const { updateFileTypeCategory } = await import("./file-type-categories")
    await updateFileTypeCategory(ctx, {
      code: "rfp",
      label: "Updated RFP",
      active: false,
    })
    expect(updateSpy).toHaveBeenCalledWith("file_type_categories", {
      label: "Updated RFP",
      active: false,
    })
  })

  it("no-ops when no fields provided", async () => {
    const { updateFileTypeCategory } = await import("./file-type-categories")
    await updateFileTypeCategory(ctx, { code: "rfp" })
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe("softDeleteFileTypeCategory", () => {
  it("sets active=false on the given code", async () => {
    userResults.set("file_type_categories", {
      data: null,
      error: null,
    })
    const { softDeleteFileTypeCategory } = await import("./file-type-categories")
    await softDeleteFileTypeCategory(ctx, "old_cat")
    expect(updateSpy).toHaveBeenCalledWith("file_type_categories", {
      active: false,
    })
  })
})

describe("reorderFileTypeCategories", () => {
  it("upserts display_order for each code in order", async () => {
    userResults.set("file_type_categories", {
      data: null,
      error: null,
    })
    const { reorderFileTypeCategories } = await import("./file-type-categories")
    await reorderFileTypeCategories(ctx, {
      codes: ["proposal", "rfp", "other"],
    })
    expect(upsertSpy).toHaveBeenCalledWith("file_type_categories", [
      { code: "proposal", display_order: 0 },
      { code: "rfp", display_order: 1 },
      { code: "other", display_order: 2 },
    ])
  })

  it("no-ops on empty codes array", async () => {
    const { reorderFileTypeCategories } = await import("./file-type-categories")
    await reorderFileTypeCategories(ctx, { codes: [] })
    expect(upsertSpy).not.toHaveBeenCalled()
  })
})
