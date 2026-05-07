import { describe, it, expect, vi, beforeEach } from "vitest"
import { fieldDefinitionSchema } from "./field-definitions"

const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockSelect = vi.fn()

function buildMockChain() {
  const qb = { select: mockSelect, eq: mockEq, order: mockOrder }
  for (const key of Object.keys(qb)) {
    qb[key as keyof typeof qb].mockReturnValue(qb)
  }
  return qb
}

const mockFrom = vi.fn()

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
  user: { id: "user-1", email: "alice@nodwin.com", role: "admin" },
  source: "web" as const,
}

const mockDbField = {
  id: "field-1",
  entity_type: "contact",
  key: "second_payment_terms",
  label: "Second Payment Terms",
  data_type: "text",
  options: null,
  required: false,
  default_value: null,
  visible_to_roles: null,
  editable_by_roles: null,
  visible_at_stages: null,
  display_order: 0,
  active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
}

const mockDbSelectField = {
  id: "field-2",
  entity_type: "contact",
  key: "industry_specialization",
  label: "Industry Specialization",
  data_type: "single_select",
  options: ["Technology", "Finance", "Healthcare"],
  required: true,
  default_value: null,
  visible_to_roles: null,
  editable_by_roles: null,
  visible_at_stages: null,
  display_order: 1,
  active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
}

describe("getFieldDefinitions", () => {
  it("returns mapped field definitions ordered by display_order", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [mockDbField, mockDbSelectField],
      error: null,
    })

    const { getFieldDefinitions } = await import("./field-definitions")
    const result = await getFieldDefinitions(defaultCtx, "contact")

    expect(result).toHaveLength(2)
    expect(result[0].key).toBe("second_payment_terms")
    expect(result[0].dataType).toBe("text")
    expect(result[0].label).toBe("Second Payment Terms")
    expect(result[1].key).toBe("industry_specialization")
    expect(result[1].dataType).toBe("single_select")
    expect(result[1].options).toEqual(["Technology", "Finance", "Healthcare"])
    expect(result[1].required).toBe(true)
  })

  it("queries field_definitions with correct filters", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [],
      error: null,
    })

    const { getFieldDefinitions } = await import("./field-definitions")
    await getFieldDefinitions(defaultCtx, "contact")

    expect(mockFrom).toHaveBeenCalledWith("field_definitions")
    expect(mockEq).toHaveBeenCalledWith("entity_type", "contact")
    expect(mockEq).toHaveBeenCalledWith("active", true)
    expect(mockOrder).toHaveBeenCalledWith("display_order", { ascending: true })
  })

  it("returns empty array when no definitions exist", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [],
      error: null,
    })

    const { getFieldDefinitions } = await import("./field-definitions")
    const result = await getFieldDefinitions(defaultCtx, "contact")

    expect(result).toEqual([])
  })

  it("throws on supabase error", async () => {
    mockOrder.mockResolvedValueOnce({
      data: null,
      error: new Error("DB error"),
    })

    const { getFieldDefinitions } = await import("./field-definitions")
    await expect(getFieldDefinitions(defaultCtx, "contact")).rejects.toThrow(
      "Failed to load field definitions",
    )
  })

  it("filters by entity type", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [mockDbField],
      error: null,
    })

    const { getFieldDefinitions } = await import("./field-definitions")
    await getFieldDefinitions(defaultCtx, "opportunity")

    expect(mockEq).toHaveBeenCalledWith("entity_type", "opportunity")
  })
})

describe("FieldDefinition type", () => {
  it("has correct shape from domain mapping", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [mockDbField],
      error: null,
    })

    const { getFieldDefinitions } = await import("./field-definitions")
    const [result] = await getFieldDefinitions(defaultCtx, "contact")

    expect(result.id).toBe("field-1")
    expect(result.entityType).toBe("contact")
    expect(result.required).toBe(false)
    expect(result.active).toBe(true)
    expect(result.displayOrder).toBe(0)
  })
})

describe("fieldDefinitionSchema", () => {
  it("validates a valid field definition", () => {
    const result = fieldDefinitionSchema.safeParse({
      id: "field-1",
      entityType: "contact",
      key: "test_key",
      label: "Test Label",
      dataType: "text",
      options: null,
      required: false,
      defaultValue: null,
      visibleToRoles: null,
      editableByRoles: null,
      visibleAtStages: null,
      displayOrder: 0,
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-15T00:00:00Z",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid data type", () => {
    const result = fieldDefinitionSchema.safeParse({
      id: "field-1",
      entityType: "contact",
      key: "test_key",
      label: "Test Label",
      dataType: "invalid_type",
      options: null,
      required: false,
      defaultValue: null,
      visibleToRoles: null,
      editableByRoles: null,
      visibleAtStages: null,
      displayOrder: 0,
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-15T00:00:00Z",
    })
    expect(result.success).toBe(false)
  })
})

describe("getAllFieldDefinitions", () => {
  it("returns all field definitions without active filter, sorted by entity and order", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [{ ...mockDbField, entity_type: "opportunity" }, mockDbSelectField],
      error: null,
    })

    const { getAllFieldDefinitions } = await import("./field-definitions")
    const result = await getAllFieldDefinitions(defaultCtx)

    expect(result).toHaveLength(2)
    expect(result[0].entityType).toBe("contact")
    expect(result[1].entityType).toBe("opportunity")
  })
})
