import { describe, it, expect, vi, beforeEach } from "vitest"
import { entityCreateSchema, entityUpdateSchema } from "./entities"

const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockSingle = vi.fn()
const mockFrom = vi.fn()

function buildMockChain() {
  const qb = {
    select: mockSelect,
    eq: mockEq,
    order: mockOrder,
    insert: mockInsert,
    update: mockUpdate,
    single: mockSingle,
  }
  for (const key of Object.keys(qb)) {
    qb[key as keyof typeof qb].mockReturnValue(qb)
  }
  return qb
}

beforeEach(() => {
  vi.resetAllMocks()
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

const mockDbEntity = {
  id: "entity-1",
  name: "Nodwin",
  legal_name: "Nodwin Group Pte Ltd",
  country: "SG",
  base_currency: "USD",
  fiscal_year_start_month: 4,
  active: true,
  display_name: null,
  logo_url: null,
  email_footer: null,
  custom_data: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
  created_by: "user-1",
  updated_by: "user-1",
}

const mockDbEntity2 = {
  id: "entity-2",
  name: "Trinity",
  legal_name: "Trinity Gaming India Pvt Ltd",
  country: "IN",
  base_currency: "INR",
  fiscal_year_start_month: 4,
  active: true,
  display_name: "Trinity Gaming",
  logo_url: "https://cdn.example.com/trinity.png",
  email_footer: "Trinity Gaming — A Nodwin Group Company",
  custom_data: { region: "india" },
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-15T00:00:00Z",
  created_by: "user-1",
  updated_by: "user-1",
}

describe("getAllEntities", () => {
  it("returns all entities ordered by name", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [mockDbEntity, mockDbEntity2],
      error: null,
    })

    const { getAllEntities } = await import("./entities")
    const result = await getAllEntities(defaultCtx)

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe("Nodwin")
    expect(result[0].baseCurrency).toBe("USD")
    expect(result[1].name).toBe("Trinity")
    expect(result[1].displayName).toBe("Trinity Gaming")
  })

  it("returns empty array when no entities exist", async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null })

    const { getAllEntities } = await import("./entities")
    const result = await getAllEntities(defaultCtx)

    expect(result).toEqual([])
  })

  it("throws on supabase error", async () => {
    mockOrder.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { getAllEntities } = await import("./entities")
    await expect(getAllEntities(defaultCtx)).rejects.toThrow(
      "Failed to load entities",
    )
  })
})

describe("getEntityById", () => {
  it("returns entity when found", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbEntity,
      error: null,
    })

    const { getEntityById } = await import("./entities")
    const result = await getEntityById(defaultCtx, "entity-1")

    expect(result).not.toBeNull()
    expect(result!.id).toBe("entity-1")
    expect(result!.name).toBe("Nodwin")
    expect(mockFrom).toHaveBeenCalledWith("entities")
    expect(mockEq).toHaveBeenCalledWith("id", "entity-1")
  })

  it("returns null when entity not found", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST116", message: "No rows found" },
    })

    const { getEntityById } = await import("./entities")
    const result = await getEntityById(defaultCtx, "nonexistent")

    expect(result).toBeNull()
  })

  it("throws on unexpected error", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "Unexpected" },
    })

    const { getEntityById } = await import("./entities")
    await expect(getEntityById(defaultCtx, "entity-1")).rejects.toThrow(
      "Failed to load entity",
    )
  })
})

describe("createEntity", () => {
  it("creates entity with required fields only", async () => {
    mockSingle.mockResolvedValueOnce({
      data: { ...mockDbEntity, name: "New Entity", country: null },
      error: null,
    })

    const { createEntity } = await import("./entities")
    const result = await createEntity(defaultCtx, {
      name: "New Entity",
    })

    expect(result.name).toBe("New Entity")
    expect(mockFrom).toHaveBeenCalledWith("entities")
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Entity" }),
    )
  })

  it("creates entity with all optional fields", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbEntity2,
      error: null,
    })

    const { createEntity } = await import("./entities")
    const result = await createEntity(defaultCtx, {
      name: "Trinity",
      legalName: "Trinity Gaming India Pvt Ltd",
      country: "IN",
      baseCurrency: "INR",
      fiscalYearStartMonth: 4,
      displayName: "Trinity Gaming",
      logoUrl: "https://cdn.example.com/trinity.png",
      emailFooter: "Trinity Gaming — A Nodwin Group Company",
      customData: { region: "india" },
    })

    expect(result.displayName).toBe("Trinity Gaming")
    expect(result.logoUrl).toBe("https://cdn.example.com/trinity.png")
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name: "Trinity Gaming",
        logo_url: "https://cdn.example.com/trinity.png",
      }),
    )
  })

  it("throws on supabase error", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { createEntity } = await import("./entities")
    await expect(
      createEntity(defaultCtx, { name: "Fail" }),
    ).rejects.toThrow("Failed to create entity")
  })
})

describe("updateEntity", () => {
  it("updates entity fields and returns updated record", async () => {
    mockEq
      .mockResolvedValueOnce({ data: null, error: null })
    mockSingle
      .mockResolvedValueOnce({
        data: { ...mockDbEntity, name: "Updated Nodwin", country: "SG" },
        error: null,
      })

    const { updateEntity } = await import("./entities")
    const result = await updateEntity(defaultCtx, "entity-1", {
      name: "Updated Nodwin",
      country: "SG",
    })

    expect(result.name).toBe("Updated Nodwin")
    expect(mockFrom).toHaveBeenCalledWith("entities")
    expect(mockUpdate).toHaveBeenCalledWith({ name: "Updated Nodwin", country: "SG" })
  })

  it("skips update when no fields changed", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbEntity,
      error: null,
    })

    const { updateEntity } = await import("./entities")
    const result = await updateEntity(defaultCtx, "entity-1", {})

    expect(result.id).toBe("entity-1")
  })
})

describe("deactivateEntity", () => {
  it("sets active=false on entity", async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null })

    const { deactivateEntity } = await import("./entities")
    await deactivateEntity(defaultCtx, "entity-1")

    expect(mockFrom).toHaveBeenCalledWith("entities")
    expect(mockUpdate).toHaveBeenCalledWith({ active: false })
    expect(mockEq).toHaveBeenCalledWith("id", "entity-1")
  })

  it("throws on supabase error", async () => {
    mockEq.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { deactivateEntity } = await import("./entities")
    await expect(
      deactivateEntity(defaultCtx, "entity-1"),
    ).rejects.toThrow("Failed to deactivate entity")
  })
})

describe("entityCreateSchema", () => {
  it("accepts valid minimal input", () => {
    const result = entityCreateSchema.safeParse({ name: "Test Entity" })
    expect(result.success).toBe(true)
  })

  it("rejects empty name", () => {
    const result = entityCreateSchema.safeParse({ name: "" })
    expect(result.success).toBe(false)
  })

  it("rejects invalid fiscal year month", () => {
    const result = entityCreateSchema.safeParse({
      name: "Test",
      fiscalYearStartMonth: 13,
    })
    expect(result.success).toBe(false)
  })

  it("applies defaults", () => {
    const result = entityCreateSchema.safeParse({ name: "Test" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.baseCurrency).toBe("USD")
      expect(result.data.fiscalYearStartMonth).toBe(1)
    }
  })
})

describe("entityUpdateSchema", () => {
  it("accepts partial input", () => {
    const result = entityUpdateSchema.safeParse({ name: "Updated" })
    expect(result.success).toBe(true)
  })

  it("accepts empty input", () => {
    const result = entityUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("accepts null for nullable fields", () => {
    const result = entityUpdateSchema.safeParse({ legalName: null })
    expect(result.success).toBe(true)
  })
})
