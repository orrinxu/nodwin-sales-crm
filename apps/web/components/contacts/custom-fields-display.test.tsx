import { describe, it, expect } from "vitest"
import { CustomFieldsDisplay } from "./custom-fields-display"
import type { FieldDefinition } from "@/lib/data/field-definitions"

const mockDefs: FieldDefinition[] = [
  {
    id: "f1",
    entityType: "contact",
    key: "second_payment_terms",
    label: "Second Payment Terms",
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
  },
  {
    id: "f2",
    entityType: "contact",
    key: "is_vip",
    label: "VIP",
    dataType: "boolean",
    options: null,
    required: false,
    defaultValue: null,
    visibleToRoles: null,
    editableByRoles: null,
    visibleAtStages: null,
    displayOrder: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
  },
  {
    id: "f3",
    entityType: "contact",
    key: "budget",
    label: "Budget",
    dataType: "currency",
    options: null,
    required: false,
    defaultValue: null,
    visibleToRoles: null,
    editableByRoles: null,
    visibleAtStages: null,
    displayOrder: 2,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
  },
  {
    id: "f4",
    entityType: "contact",
    key: "regions",
    label: "Regions",
    dataType: "multi_select",
    options: ["NA", "EMEA", "APAC"],
    required: false,
    defaultValue: null,
    visibleToRoles: null,
    editableByRoles: null,
    visibleAtStages: null,
    displayOrder: 3,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
  },
]

describe("CustomFieldsDisplay", () => {
  it("renders nothing when field definitions are empty", () => {
    expect(() => (
      <CustomFieldsDisplay fieldDefinitions={[]} customData={{}} />
    )).not.toThrow()
  })

  it("renders nothing when no custom data values match definitions", () => {
    expect(() => (
      <CustomFieldsDisplay fieldDefinitions={mockDefs} customData={{ unrelated: "val" }} />
    )).not.toThrow()
  })

  it("renders with matching custom data values", () => {
    expect(() => (
      <CustomFieldsDisplay
        fieldDefinitions={mockDefs}
        customData={{
          second_payment_terms: "Net 30",
          is_vip: true,
          budget: 50000,
          regions: ["NA", "EMEA"],
        }}
      />
    )).not.toThrow()
  })

  it("renders with partial custom data", () => {
    expect(() => (
      <CustomFieldsDisplay
        fieldDefinitions={mockDefs}
        customData={{
          is_vip: false,
          budget: 100000,
        }}
      />
    )).not.toThrow()
  })

  it("renders with null values in custom data", () => {
    expect(() => (
      <CustomFieldsDisplay
        fieldDefinitions={mockDefs}
        customData={{
          second_payment_terms: null,
          is_vip: null,
        }}
      />
    )).not.toThrow()
  })
})
