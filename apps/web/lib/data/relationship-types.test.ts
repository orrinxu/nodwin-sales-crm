import { describe, it, expect, vi, beforeEach } from "vitest"
import { relationshipTypeCreateSchema, relationshipTypeUpdateSchema } from "./relationship-types"

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
  user: { id: "aaaaaaaa-1111-1111-1111-111111111111", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

const mockDbRelationshipType = {
  code: "subsidiary_of",
  label: "Subsidiary Of",
  description: "Company is a subsidiary of another company",
  active: true,
  sort_order: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
}

const mockDbRelationshipType2 = {
  code: "partner_with",
  label: "Partner With",
  description: null,
  active: true,
  sort_order: 2,
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-15T00:00:00Z",
}

describe("getAllRelationshipTypes", () => {
  it("returns all relationship types ordered by sort_order", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [mockDbRelationshipType, mockDbRelationshipType2],
      error: null,
    })

    const { getAllRelationshipTypes } = await import("./relationship-types")
    const result = await getAllRelationshipTypes(defaultCtx)

    expect(result).toHaveLength(2)
    expect(result[0].code).toBe("subsidiary_of")
    expect(result[0].label).toBe("Subsidiary Of")
    expect(result[0].description).toBe("Company is a subsidiary of another company")
    expect(result[1].code).toBe("partner_with")
    expect(result[1].description).toBeNull()
  })

  it("returns empty array when no relationship types exist", async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null })

    const { getAllRelationshipTypes } = await import("./relationship-types")
    const result = await getAllRelationshipTypes(defaultCtx)

    expect(result).toEqual([])
  })

  it("throws on supabase error", async () => {
    mockOrder.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { getAllRelationshipTypes } = await import("./relationship-types")
    await expect(getAllRelationshipTypes(defaultCtx)).rejects.toThrow(
      "Failed to load relationship types",
    )
  })
})

describe("createRelationshipType", () => {
  it("creates relationship type with required fields", async () => {
    mockSingle.mockResolvedValueOnce({
      data: { ...mockDbRelationshipType, label: "New Type", description: null },
      error: null,
    })

    const { createRelationshipType } = await import("./relationship-types")
    const result = await createRelationshipType(defaultCtx, {
      code: "new_type",
      label: "New Type",
    })

    expect(result.code).toBe("subsidiary_of")
    expect(mockFrom).toHaveBeenCalledWith("relationship_types")
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "new_type",
        label: "New Type",
      }),
    )
  })

  it("creates relationship type with all fields", async () => {
    mockSingle.mockResolvedValueOnce({
      data: mockDbRelationshipType,
      error: null,
    })

    const { createRelationshipType } = await import("./relationship-types")
    await createRelationshipType(defaultCtx, {
      code: "subsidiary_of",
      label: "Subsidiary Of",
      description: "Company is a subsidiary of another company",
      sortOrder: 1,
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Company is a subsidiary of another company",
        sort_order: 1,
      }),
    )
  })

  it("throws on supabase error", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { createRelationshipType } = await import("./relationship-types")
    await expect(
      createRelationshipType(defaultCtx, { code: "fail", label: "Fail" }),
    ).rejects.toThrow("Failed to create relationship type")
  })
})

describe("updateRelationshipType", () => {
  it("updates relationship type fields", async () => {
    mockEq
      .mockResolvedValueOnce({ data: null, error: null })
    mockSingle
      .mockResolvedValueOnce({
        data: { ...mockDbRelationshipType, label: "Updated", description: "New desc" },
        error: null,
      })

    const { updateRelationshipType } = await import("./relationship-types")
    const result = await updateRelationshipType(defaultCtx, "subsidiary_of", {
      label: "Updated",
      description: "New desc",
    })

    expect(result.label).toBe("Updated")
    expect(result.description).toBe("New desc")
    expect(mockUpdate).toHaveBeenCalledWith({
      label: "Updated",
      description: "New desc",
    })
  })

  it("throws when no fields to update", async () => {
    const { updateRelationshipType } = await import("./relationship-types")
    await expect(
      updateRelationshipType(defaultCtx, "subsidiary_of", {}),
    ).rejects.toThrow("No fields to update")
  })
})

describe("deactivateRelationshipType", () => {
  it("sets active=false on relationship type", async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null })

    const { deactivateRelationshipType } = await import("./relationship-types")
    await deactivateRelationshipType(defaultCtx, "subsidiary_of")

    expect(mockFrom).toHaveBeenCalledWith("relationship_types")
    expect(mockUpdate).toHaveBeenCalledWith({ active: false })
    expect(mockEq).toHaveBeenCalledWith("code", "subsidiary_of")
  })

  it("throws on supabase error", async () => {
    mockEq.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { deactivateRelationshipType } = await import("./relationship-types")
    await expect(
      deactivateRelationshipType(defaultCtx, "subsidiary_of"),
    ).rejects.toThrow("Failed to deactivate relationship type")
  })
})

describe("relationshipTypeCreateSchema", () => {
  it("accepts valid input", () => {
    const result = relationshipTypeCreateSchema.safeParse({
      code: "test_type",
      label: "Test Type",
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty code", () => {
    const result = relationshipTypeCreateSchema.safeParse({ code: "", label: "Test" })
    expect(result.success).toBe(false)
  })

  it("rejects code starting with number", () => {
    const result = relationshipTypeCreateSchema.safeParse({
      code: "1invalid",
      label: "Test",
    })
    expect(result.success).toBe(false)
  })

  it("rejects code with uppercase", () => {
    const result = relationshipTypeCreateSchema.safeParse({
      code: "InvalidCode",
      label: "Test",
    })
    expect(result.success).toBe(false)
  })

  it("accepts code with numbers and underscores", () => {
    const result = relationshipTypeCreateSchema.safeParse({
      code: "test_type_2",
      label: "Test",
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty label", () => {
    const result = relationshipTypeCreateSchema.safeParse({
      code: "test",
      label: "",
    })
    expect(result.success).toBe(false)
  })

  it("defaults sortOrder to 0", () => {
    const result = relationshipTypeCreateSchema.safeParse({
      code: "test",
      label: "Test",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sortOrder).toBe(0)
    }
  })
})

describe("relationshipTypeUpdateSchema", () => {
  it("accepts partial input", () => {
    const result = relationshipTypeUpdateSchema.safeParse({ label: "Updated" })
    expect(result.success).toBe(true)
  })

  it("accepts empty input", () => {
    const result = relationshipTypeUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})
