import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { FieldDefinitionsList } from "./field-definitions-list"
import type { FieldDefinition, ReorderFieldDefinitionsInput } from "@/lib/data/field-definitions"

const mockRefresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("server-only", () => ({}))

const mockCreateAction = vi.fn()
const mockBulkDeleteAction = vi.fn()
const mockSoftDeleteAction = vi.fn()
const mockUpdateAction = vi.fn()
const mockReorderAction = vi.fn<(input: ReorderFieldDefinitionsInput) => Promise<void>>()

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

function renderList() {
  return render(
    <FieldDefinitionsList
      fieldDefinitions={sampleFields}
      createAction={mockCreateAction}
      bulkDeleteAction={mockBulkDeleteAction}
      softDeleteAction={mockSoftDeleteAction}
      updateAction={mockUpdateAction}
      reorderAction={mockReorderAction}
    />,
  )
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

  it("shows drag handles for each row", () => {
    renderList()
    const handles = screen.getAllByLabelText("Drag to reorder")
    expect(handles).toHaveLength(sampleFields.length)
  })

  it("shows empty state when no fields defined", () => {
    render(
      <FieldDefinitionsList
        fieldDefinitions={[]}
        createAction={mockCreateAction}
        bulkDeleteAction={mockBulkDeleteAction}
        softDeleteAction={mockSoftDeleteAction}
        updateAction={mockUpdateAction}
        reorderAction={mockReorderAction}
      />,
    )
    expect(
      screen.getByText("No custom fields defined yet."),
    ).toBeInTheDocument()
  })
})
