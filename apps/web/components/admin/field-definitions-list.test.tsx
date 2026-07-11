import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { FieldDefinitionsList } from "./field-definitions-list"
import type {
  FieldDefinition,
  ReorderFieldDefinitionsInput,
} from "@/lib/data/field-definitions.types"
import type {
  FileTypeCategory,
  CreateFileTypeCategoryInput,
  UpdateFileTypeCategoryInput,
  ReorderFileTypeCategoriesInput,
} from "@/lib/data/file-type-categories.types"

const mockRefresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("server-only", () => ({}))

const mockCreateAction = vi.fn()
const mockBulkDeleteAction = vi.fn()
const mockSoftDeleteAction = vi.fn()
const mockUpdateAction = vi.fn()
const mockReorderAction =
  vi.fn<(input: ReorderFieldDefinitionsInput) => Promise<void>>()

const mockCreateFtcAction =
  vi.fn<(input: CreateFileTypeCategoryInput) => Promise<void>>()
const mockUpdateFtcAction =
  vi.fn<(input: UpdateFileTypeCategoryInput) => Promise<void>>()
const mockDeleteFtcAction = vi.fn<(code: string) => Promise<void>>()
const mockReorderFtcAction =
  vi.fn<(input: ReorderFileTypeCategoriesInput) => Promise<void>>()

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

const sampleFtc: FileTypeCategory[] = [
  {
    code: "contract",
    label: "Contract",
    description: "Legal contracts and agreements",
    active: true,
    displayOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
    createdBy: null,
    updatedBy: null,
  },
  {
    code: "invoice",
    label: "Invoice",
    description: null,
    active: true,
    displayOrder: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
    createdBy: null,
    updatedBy: null,
  },
]

const defaultProps = {
  fieldDefinitions: sampleFields,
  fileTypeCategories: sampleFtc,
  createAction: mockCreateAction,
  bulkDeleteAction: mockBulkDeleteAction,
  softDeleteAction: mockSoftDeleteAction,
  updateAction: mockUpdateAction,
  reorderAction: mockReorderAction,
  createFileTypeCategoryAction: mockCreateFtcAction,
  updateFileTypeCategoryAction: mockUpdateFtcAction,
  deleteFileTypeCategoryAction: mockDeleteFtcAction,
  reorderFileTypeCategoriesAction: mockReorderFtcAction,
}

function renderList(overrides = {}) {
  return render(<FieldDefinitionsList {...defaultProps} {...overrides} />)
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
    expect(screen.getByText("Manage custom field definitions across all entity types.")).toBeInTheDocument()
  })

  it("shows drag handles for each row", () => {
    renderList()
    const handles = screen.getAllByLabelText("Drag to reorder")
    expect(handles).toHaveLength(sampleFields.length)
  })

  it("shows empty state when no fields defined", () => {
    renderList({ fieldDefinitions: [] })
    expect(
      screen.getByText("No custom fields defined yet."),
    ).toBeInTheDocument()
  })

  it("shows tabs for custom fields and file type categories", () => {
    renderList()
    expect(screen.getByRole("tab", { name: "Custom Fields" })).toBeInTheDocument()
    expect(
      screen.getByRole("tab", { name: "File Type Categories" }),
    ).toBeInTheDocument()
  })

  it("switches to file type categories tab", async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole("tab", { name: "File Type Categories" }))
    expect(screen.getByText("Contract")).toBeInTheDocument()
    expect(screen.getByText("Invoice")).toBeInTheDocument()
  })

  it("shows file type category drag handles", async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole("tab", { name: "File Type Categories" }))
    const handles = screen.getAllByLabelText("Drag to reorder")
    expect(handles).toHaveLength(sampleFtc.length)
  })

  it("shows empty state when no file type categories", async () => {
    const user = userEvent.setup()
    renderList({ fileTypeCategories: [] })
    await user.click(screen.getByRole("tab", { name: "File Type Categories" }))
    expect(
      screen.getByText("No file type categories defined yet."),
    ).toBeInTheDocument()
  })

  it("opens file type category create dialog", async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole("tab", { name: "File Type Categories" }))
    await user.click(
      screen.getByRole("button", { name: "Add File Type" }),
    )
    expect(
      screen.getByText("Add File Type Category"),
    ).toBeInTheDocument()
  })
})
