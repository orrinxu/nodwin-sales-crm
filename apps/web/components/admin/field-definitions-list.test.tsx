import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

import { FieldDefinitionsList } from "./field-definitions-list"
import type { FieldDefinition } from "@/lib/data/field-definitions"

vi.mock("server-only", () => ({}))

const sampleFields: FieldDefinition[] = [
  {
    id: "field-1",
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
    id: "field-2",
    entityType: "contact",
    key: "industry_specialization",
    label: "Industry Specialization",
    dataType: "single_select",
    options: ["Technology", "Finance", "Healthcare"],
    required: true,
    defaultValue: null,
    visibleToRoles: null,
    editableByRoles: null,
    visibleAtStages: null,
    displayOrder: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
  },
]

function renderList(fields = sampleFields) {
  return render(<FieldDefinitionsList fieldDefinitions={fields} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("FieldDefinitionsList", () => {
  it("renders without throwing", () => {
    expect(() => renderList()).not.toThrow()
  })

  it("displays field definitions in a table", () => {
    renderList()
    expect(screen.getByText("Second Payment Terms")).toBeInTheDocument()
    expect(screen.getByText("Industry Specialization")).toBeInTheDocument()
    expect(screen.getByText("Custom Fields")).toBeInTheDocument()
  })

  it("shows empty state when no fields defined", () => {
    renderList([])
    expect(
      screen.getByText("No custom fields defined yet."),
    ).toBeInTheDocument()
  })
})
