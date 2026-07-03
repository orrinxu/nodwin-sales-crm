/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { CustomFieldsForm } from "./custom-fields-form"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"

const field: FieldDefinition = {
  id: "f1",
  entityType: "account",
  key: "payment_terms",
  label: "Payment Terms",
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
  updatedAt: "2026-01-01T00:00:00Z",
}

const baseProps = {
  fieldDefinitions: [field],
  values: {},
  onChange: vi.fn(),
  errors: {},
}

describe("CustomFieldsForm", () => {
  it("renders the 'Custom Fields' heading by default", () => {
    render(<CustomFieldsForm {...baseProps} />)
    expect(screen.getByText("Custom Fields")).toBeInTheDocument()
    expect(screen.getByText("Payment Terms")).toBeInTheDocument()
  })

  it("suppresses the heading when hideHeading is set, but still renders fields", () => {
    render(<CustomFieldsForm {...baseProps} hideHeading />)
    expect(screen.queryByText("Custom Fields")).not.toBeInTheDocument()
    expect(screen.getByText("Payment Terms")).toBeInTheDocument()
  })

  it("renders nothing when there are no field definitions", () => {
    const { container } = render(<CustomFieldsForm {...baseProps} fieldDefinitions={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
