import { describe, it, expect, vi, beforeEach } from "vitest"
import { businessUnitCreateSchema, businessUnitUpdateSchema } from "./business-units"

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
  vi.clearAllMocks()
  mockFrom.mockReturnValue(buildMockChain())
})

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock("server-only", () => ({}))

const defaultCtx = {
  user: { id: "aaaaaaaa-1111-1111-1111-111111111111", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

const entityId = "aaaaaaaa-2222-2222-2222-222222222222"
const userId = "aaaaaaaa-3333-3333-3333-333333333333"

const mockDbBusinessUnit = {
  id: "aaaaaaaa-4444-4444-4444-444444444444",
  name: "India Sales",
  entity_id: entityId,
  kind: "sales",
  parent_id: null,
  manager_user_id: userId,
  active: true,
  custom_data: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
  created_by: "aaaaaaaa-1111-1111-1111-111111111111",
  updated_by: "aaaaaaaa-1111-1111-1111-111111111111",
  entity: { name: "Nodwin" },
  parent: null,
  manager: { full_name: "Bob Manager" },
}

const mockDbBusinessUnit2 = {
  id: "aaaaaaaa-5555-5555-5555-555555555555",
  name: "SEA Ops",
  entity_id: entityId,
  kind: "ops",
  parent_id: "aaaaaaaa-4444-4444-4444-444444444444",
  manager_user_id: null,
  active: true,
  custom_data: { tier: "premium" },
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-15T00:00:00Z",
  created_by: "aaaaaaaa-1111-1111-1111-111111111111",
  updated_by: "aaaaaaaa-1111-1111-1111-111111111111",
  entity: { name: "Nodwin" },
  parent: { name: "India Sales" },
  manager: null,
}

describe("getAllBusinessUnits", () => {
  it("returns all business units with entity/parent/manager joins", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [mockDbBusinessUnit, mockDbBusinessUnit2],
      error: null,
    })

    const { getAllBusinessUnits } = await import("./business-units")
    const result = await getAllBusinessUnits(defaultCtx)

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe("India Sales")
    expect(result[0].entityName).toBe("Nodwin")
    expect(result[0].managerName).toBe("Bob Manager")
    expect(result[1].kind).toBe("ops")
    expect(result[1].parentName).toBe("India Sales")
  })

  it("returns empty array when no business units exist", async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null })

    const { getAllBusinessUnits } = await import("./business-units")
    const result = await getAllBusinessUnits(defaultCtx)

    expect(result).toEqual([])
  })

  it("throws on supabase error", async () => {
    mockOrder.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { getAllBusinessUnits } = await import("./business-units")
    await expect(getAllBusinessUnits(defaultCtx)).rejects.toThrow(
      "Failed to load business units",
    )
  })
})

describe("getBusinessUnitById", () => {
  it("returns business unit when found", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbBusinessUnit,
      error: null,
    })

    const { getBusinessUnitById } = await import("./business-units")
    const result = await getBusinessUnitById(defaultCtx, mockDbBusinessUnit.id)

    expect(result).not.toBeNull()
    expect(result!.id).toBe(mockDbBusinessUnit.id)
    expect(result!.entityName).toBe("Nodwin")
    expect(mockFrom).toHaveBeenCalledWith("business_units")
    expect(mockEq).toHaveBeenCalledWith("id", mockDbBusinessUnit.id)
  })

  it("returns null when business unit not found", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST116", message: "No rows found" },
    })

    const { getBusinessUnitById } = await import("./business-units")
    const result = await getBusinessUnitById(defaultCtx, "nonexistent")

    expect(result).toBeNull()
  })

  it("throws on unexpected error", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "Unexpected" },
    })

    const { getBusinessUnitById } = await import("./business-units")
    await expect(getBusinessUnitById(defaultCtx, mockDbBusinessUnit.id)).rejects.toThrow(
      "Failed to load business unit",
    )
  })
})

describe("createBusinessUnit", () => {
  it("creates business unit with required fields only", async () => {
    mockSingle.mockResolvedValueOnce({
      data: { ...mockDbBusinessUnit, name: "New BU", entity_id: null, parent_id: null, manager_user_id: null, entity: null, parent: null, manager: null },
      error: null,
    })

    const { createBusinessUnit } = await import("./business-units")
    const result = await createBusinessUnit(defaultCtx, { name: "New BU" })

    expect(result.name).toBe("New BU")
    expect(result.kind).toBe("sales")
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New BU", kind: "sales" }),
    )
  })

  it("creates business unit with all optional fields", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbBusinessUnit,
      error: null,
    })

    const { createBusinessUnit } = await import("./business-units")
    const result = await createBusinessUnit(defaultCtx, {
      name: "India Sales",
      entityId,
      kind: "sales",
      managerUserId: userId,
    })

    expect(result.entityId).toBe(entityId)
    expect(result.managerUserId).toBe(userId)
  })

  it("throws on zod validation when given invalid uuid", async () => {
    const { createBusinessUnit } = await import("./business-units")
    await expect(
      createBusinessUnit(defaultCtx, { name: "Fail", entityId: "not-a-uuid" }),
    ).rejects.toThrow()
  })

  it("throws on supabase error", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { createBusinessUnit } = await import("./business-units")
    await expect(
      createBusinessUnit(defaultCtx, { name: "Fail" }),
    ).rejects.toThrow("Failed to create business unit")
  })
})

describe("updateBusinessUnit", () => {
  it("updates business unit fields and returns updated record", async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null })
    mockSingle
      .mockResolvedValueOnce({
        data: { ...mockDbBusinessUnit, name: "Updated BU" },
        error: null,
      })

    const { updateBusinessUnit } = await import("./business-units")
    const result = await updateBusinessUnit(defaultCtx, mockDbBusinessUnit.id, {
      name: "Updated BU",
    })

    expect(result.name).toBe("Updated BU")
    expect(mockUpdate).toHaveBeenCalledWith({ name: "Updated BU" })
  })

  it("skips update when no fields changed", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbBusinessUnit,
      error: null,
    })

    const { updateBusinessUnit } = await import("./business-units")
    const result = await updateBusinessUnit(defaultCtx, mockDbBusinessUnit.id, {})

    expect(result.id).toBe(mockDbBusinessUnit.id)
  })

  it("nulls entityId when passed null", async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null })
    mockSingle
      .mockResolvedValueOnce({
        data: { ...mockDbBusinessUnit, entity_id: null, entity: null },
        error: null,
      })

    const { updateBusinessUnit } = await import("./business-units")
    const result = await updateBusinessUnit(defaultCtx, mockDbBusinessUnit.id, {
      entityId: null,
    })

    expect(result.entityId).toBeNull()
    expect(mockUpdate).toHaveBeenCalledWith({ entity_id: null })
  })
})

describe("deactivateBusinessUnit", () => {
  it("sets active=false on business unit", async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null })

    const { deactivateBusinessUnit } = await import("./business-units")
    await deactivateBusinessUnit(defaultCtx, mockDbBusinessUnit.id)

    expect(mockFrom).toHaveBeenCalledWith("business_units")
    expect(mockUpdate).toHaveBeenCalledWith({ active: false })
    expect(mockEq).toHaveBeenCalledWith("id", mockDbBusinessUnit.id)
  })

  it("throws on supabase error", async () => {
    mockEq.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { deactivateBusinessUnit } = await import("./business-units")
    await expect(
      deactivateBusinessUnit(defaultCtx, mockDbBusinessUnit.id),
    ).rejects.toThrow("Failed to deactivate business unit")
  })
})

describe("businessUnitCreateSchema", () => {
  it("accepts valid minimal input", () => {
    const result = businessUnitCreateSchema.safeParse({ name: "Test BU" })
    expect(result.success).toBe(true)
  })

  it("rejects empty name", () => {
    const result = businessUnitCreateSchema.safeParse({ name: "" })
    expect(result.success).toBe(false)
  })

  it("rejects invalid kind", () => {
    const result = businessUnitCreateSchema.safeParse({
      name: "Test",
      kind: "invalid",
    })
    expect(result.success).toBe(false)
  })

  it("accepts all valid kinds", () => {
    for (const kind of ["sales", "revenue_recognition", "ops", "shared"]) {
      const result = businessUnitCreateSchema.safeParse({ name: "Test", kind })
      expect(result.success).toBe(true)
    }
  })

  it("defaults kind to sales", () => {
    const result = businessUnitCreateSchema.safeParse({ name: "Test" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.kind).toBe("sales")
    }
  })
})

describe("businessUnitUpdateSchema", () => {
  it("accepts partial input", () => {
    const result = businessUnitUpdateSchema.safeParse({ name: "Updated" })
    expect(result.success).toBe(true)
  })

  it("accepts empty input", () => {
    const result = businessUnitUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})
