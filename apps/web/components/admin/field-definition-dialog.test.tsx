import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { FieldDefinitionDialog } from "./field-definition-dialog"

vi.mock("server-only", () => ({}))

const mockCreateAction = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
})

describe("FieldDefinitionDialog", () => {
  it("renders without throwing", () => {
    expect(() =>
      render(<FieldDefinitionDialog createAction={mockCreateAction} />),
    ).not.toThrow()
  })

  it("shows trigger button with Add Custom Field label", () => {
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)
    expect(screen.getByText("Add Custom Field")).toBeInTheDocument()
  })

  it("opens dialog when trigger is clicked", async () => {
    const user = userEvent.setup()
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)

    await user.click(screen.getByText("Add Custom Field"))

    expect(screen.getByText("Create Custom Field")).toBeInTheDocument()
    expect(screen.getByText("Label")).toBeInTheDocument()
    expect(screen.getByText("Data Type")).toBeInTheDocument()
  })

  it("shows validation error when label is empty on submit", async () => {
    const user = userEvent.setup()
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)

    await user.click(screen.getByText("Add Custom Field"))
    await user.click(screen.getByText("Create"))

    expect(await screen.findByText("Label is required")).toBeInTheDocument()
    expect(mockCreateAction).not.toHaveBeenCalled()
  })

  it("shows options field for single_select data type", async () => {
    const user = userEvent.setup()
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)

    await user.click(screen.getByText("Add Custom Field"))

    const dataTypeTrigger = screen.getByTestId("data-type-select-trigger")
    await user.click(dataTypeTrigger)

    const option = await screen.findByText("single select")
    await user.click(option)

    await waitFor(() => {
      expect(screen.getByText("Options (comma-separated)")).toBeInTheDocument()
    })
  })

  it("hides options field for text data type", async () => {
    const user = userEvent.setup()
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)

    await user.click(screen.getByText("Add Custom Field"))

    expect(screen.queryByText("Options (comma-separated)")).not.toBeInTheDocument()
  })

  it("calls createAction with correct data on submit", async () => {
    mockCreateAction.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)

    await user.click(screen.getByText("Add Custom Field"))

    const labelInput = screen.getByLabelText(/label/i)
    await user.clear(labelInput)
    await user.type(labelInput, "Deal Size")

    await user.click(screen.getByText("Create"))

    await waitFor(() => {
      expect(mockCreateAction).toHaveBeenCalledWith({
        entityType: "account",
        label: "Deal Size",
        dataType: "text",
        options: null,
        required: false,
        displayOrder: 0,
      })
    })
  })

  it("submits options as array for multi_select type", async () => {
    mockCreateAction.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)

    await user.click(screen.getByText("Add Custom Field"))

    const dataTypeTrigger = screen.getByTestId("data-type-select-trigger")
    await user.click(dataTypeTrigger)

    const multiSelectOption = await screen.findByText("multi select")
    await user.click(multiSelectOption)

    const labelInput = screen.getByLabelText(/label/i)
    await user.clear(labelInput)
    await user.type(labelInput, "Tags")

    const optionsInput = screen.getByLabelText(/options/i)
    await user.clear(optionsInput)
    await user.type(optionsInput, "A, B, C")

    await user.click(screen.getByText("Create"))

    await waitFor(() => {
      expect(mockCreateAction).toHaveBeenCalledWith({
        entityType: "account",
        label: "Tags",
        dataType: "multi_select",
        options: ["A", "B", "C"],
        required: false,
        displayOrder: 0,
      })
    })
  })

  it("shows error message on failure", async () => {
    mockCreateAction.mockRejectedValueOnce(new Error("Duplicate key"))
    const user = userEvent.setup()
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)

    await user.click(screen.getByText("Add Custom Field"))

    const labelInput = screen.getByLabelText(/label/i)
    await user.clear(labelInput)
    await user.type(labelInput, "Deal Size")

    await user.click(screen.getByText("Create"))

    expect(await screen.findByText("Duplicate key")).toBeInTheDocument()
  })

  it("resets form after successful submission", async () => {
    mockCreateAction.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)

    await user.click(screen.getByText("Add Custom Field"))

    const labelInput = screen.getByLabelText(/label/i)
    await user.clear(labelInput)
    await user.type(labelInput, "Deal Size")

    await user.click(screen.getByText("Create"))

    await waitFor(() => {
      expect(screen.queryByDisplayValue("Deal Size")).not.toBeInTheDocument()
    })
  })

  it("disables submit button while pending", async () => {
    mockCreateAction.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 1000)),
    )
    const user = userEvent.setup()
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)

    await user.click(screen.getByText("Add Custom Field"))

    const labelInput = screen.getByLabelText(/label/i)
    await user.clear(labelInput)
    await user.type(labelInput, "Deal Size")

    const submitButton = screen.getByText("Create")
    await user.click(submitButton)

    expect(screen.getByText("Creating...")).toBeDisabled()
  })

  it("toggles required checkbox", async () => {
    const user = userEvent.setup()
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)

    await user.click(screen.getByText("Add Custom Field"))

    const checkbox = screen.getByRole("checkbox", { name: /required/i })
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it("closes dialog when cancel is clicked", async () => {
    const user = userEvent.setup()
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)

    await user.click(screen.getByText("Add Custom Field"))
    await user.click(screen.getByText("Cancel"))

    await waitFor(() => {
      expect(screen.queryByText("Create Custom Field")).not.toBeInTheDocument()
    })
  })

  it("allows entity type selection", async () => {
    const user = userEvent.setup()
    render(<FieldDefinitionDialog createAction={mockCreateAction} />)

    await user.click(screen.getByText("Add Custom Field"))

    const entityTypeTrigger = screen.getByTestId("entity-type-select-trigger")
    await user.click(entityTypeTrigger)

    const contactOption = await screen.findByRole("option", { name: /contact/i })
    await user.click(contactOption)

    expect(screen.getByTestId("entity-type-select-trigger")).toHaveTextContent(/contact/i)
  })
})
