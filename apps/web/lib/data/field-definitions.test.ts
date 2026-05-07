import { describe, it, expect, vi, beforeEach } from "vitest"
import { fieldDefinitionSchema } from "./field-definitions"

const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockSingle = vi.fn()
const mockUpdate = vi.fn()
const mockIn = vi.fn()

function buildMockChain() {
  const qb = { select: mockSelect, eq: mockEq, order: mockOrder, insert: mockInsert, single: mockSingle, update: mockUpdate, in: mockIn }
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

describe("createFieldDefinition", () => {
  it("creates a field definition from a label", async () => {
    mockSingle.mockResolvedValueOnce({
      data: { ...mockDbField, key: "test_label", label: "Test Label", display_order: 0 },
      error: null,
    })

    const { createFieldDefinition } = await import("./field-definitions")
    const result = await createFieldDefinition(defaultCtx, {
      entityType: "contact",
      label: "Test Label",
      dataType: "text",
      options: null,
      required: false,
      displayOrder: 0,
    })

    expect(mockFrom).toHaveBeenCalledWith("field_definitions")
    expect(mockInsert).toHaveBeenCalledWith({
      entity_type: "contact",
      key: "test_label",
      label: "Test Label",
      data_type: "text",
      options: null,
      required: false,
      display_order: 0,
    })
    expect(result.label).toBe("Test Label")
  })
})

describe("bulkDeleteFieldDefinitions", () => {
  it("soft-deletes field definitions by setting active=false", async () => {
    mockIn.mockResolvedValueOnce({ data: null, error: null })

    const { bulkDeleteFieldDefinitions } = await import("./field-definitions")
    await bulkDeleteFieldDefinitions(defaultCtx, { ids: ["field-1", "field-2"] })

    expect(mockFrom).toHaveBeenCalledWith("field_definitions")
    expect(mockUpdate).toHaveBeenCalledWith({ active: false })
    expect(mockIn).toHaveBeenCalledWith("id", ["field-1", "field-2"])
  })
})

describe("softDeleteFieldDefinition", () => {
  it("soft-deletes a single field definition by id", async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null })

    const { softDeleteFieldDefinition } = await import("./field-definitions")
    await softDeleteFieldDefinition(defaultCtx, "field-1")

    expect(mockFrom).toHaveBeenCalledWith("field_definitions")
    expect(mockUpdate).toHaveBeenCalledWith({ active: false })
    expect(mockEq).toHaveBeenCalledWith("id", "field-1")
  })
})

describe("updateFieldDefinition", () => {
  it("updates allowed fields on a field definition", async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null })

    const { updateFieldDefinition } = await import("./field-definitions")
    await updateFieldDefinition(defaultCtx, {
      id: "field-1",
      label: "Updated Label",
      required: true,
      options: ["A", "B"],
      displayOrder: 5,
      visibleToRoles: ["admin"],
      editableByRoles: ["admin"],
    })

    expect(mockFrom).toHaveBeenCalledWith("field_definitions")
    expect(mockUpdate).toHaveBeenCalledWith({
      label: "Updated Label",
      required: true,
      options: ["A", "B"],
      display_order: 5,
      visible_to_roles: ["admin"],
      editable_by_roles: ["admin"],
    })
    expect(mockEq).toHaveBeenCalledWith("id", "field-1")
  })
})

describe("reorderFieldDefinitions", () => {
  it("updates display_order sequentially with correct id pairing", async () => {
    mockEq.mockResolvedValue({ data: null, error: null })

    const { reorderFieldDefinitions } = await import("./field-definitions")
    await reorderFieldDefinitions(defaultCtx, {
      items: [
        { id: "field-2", displayOrder: 1 },
        { id: "field-1", displayOrder: 0 },
      ],
    })

    expect(mockFrom).toHaveBeenCalledTimes(2)
    expect(mockFrom).toHaveBeenCalledWith("field_definitions")
    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenNthCalledWith(1, { display_order: 1 })
    expect(mockUpdate).toHaveBeenNthCalledWith(2, { display_order: 0 })
    expect(mockEq).toHaveBeenNthCalledWith(1, "id", "field-2")
    expect(mockEq).toHaveBeenNthCalledWith(2, "id", "field-1")
  })

  it("rolls back applied updates on error", async () => {
    mockEq
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("DB error") })
      .mockResolvedValueOnce({ data: null, error: null })

    const { reorderFieldDefinitions } = await import("./field-definitions")
    await expect(
      reorderFieldDefinitions(defaultCtx, {
        items: [
          { id: "field-1", displayOrder: 5 },
          { id: "field-2", displayOrder: 3 },
        ],
      }),
    ).rejects.toThrow("Failed to reorder field definition")
  })

  it("throws on supabase error", async () => {
    mockEq.mockReturnValueOnce({ error: new Error("DB error") })

    const { reorderFieldDefinitions } = await import("./field-definitions")
    await expect(
      reorderFieldDefinitions(defaultCtx, {
        items: [{ id: "field-1", displayOrder: 5 }],
      }),
    ).rejects.toThrow("Failed to reorder field definition")
  })

  it("rejects input with missing ids", async () => {
    const { reorderFieldDefinitionsSchema } = await import("./field-definitions")
    const result = reorderFieldDefinitionsSchema.safeParse({
      items: [{ displayOrder: 0 }],
    })
    expect(result.success).toBe(false)
  })
})
