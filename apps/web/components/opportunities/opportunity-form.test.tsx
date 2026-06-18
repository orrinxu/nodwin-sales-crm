import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { OpportunityForm } from "./opportunity-form"
import type { AccountOption } from "@/lib/data/contacts"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"

vi.mock("server-only", () => ({}))

const mockAccounts: AccountOption[] = [
  { id: "acct-1", name: "Acme Corp" },
  { id: "acct-2", name: "Globex Inc" },
]

const mockBusinessUnits = [
  { id: "bu-1", name: "East Asia Sales" },
  { id: "bu-2", name: "India Sales" },
]

const mockFieldDefinitions: FieldDefinition[] = [
  {
    id: "cf-1",
    entityType: "opportunity",
    key: "deal_type",
    label: "Deal Type",
    dataType: "text",
    options: null,
    required: false,
    defaultValue: null,
    visibleToRoles: null,
    editableByRoles: null,
    visibleAtStages: null,
    displayOrder: 1,
    active: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "cf-2",
    entityType: "opportunity",
    key: "margin",
    label: "Margin (%)",
    dataType: "number",
    options: null,
    required: false,
    defaultValue: null,
    visibleToRoles: null,
    editableByRoles: null,
    visibleAtStages: null,
    displayOrder: 2,
    active: true,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
]

const defaultProps = {
  accounts: mockAccounts,
  businessUnits: mockBusinessUnits,
  createAction: vi.fn(),
  onSuccess: vi.fn(),
}

describe("OpportunityForm", () => {
  it("renders create mode with trigger button", () => {
    render(<OpportunityForm {...defaultProps} />)
    expect(screen.getByText("Create Opportunity")).toBeInTheDocument()
  })

  it("renders with minimal props", () => {
    render(
      <OpportunityForm
        accounts={[]}
        businessUnits={[]}
        createAction={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )
    expect(screen.getByText("Create Opportunity")).toBeInTheDocument()
  })

  it("renders edit mode with opportunity prop", async () => {
    render(
      <OpportunityForm
        {...defaultProps}
        opportunity={{
          id: "opp-1",
          name: "Big Deal",
          accountId: "acct-1",
          accountName: "Acme Corp",
          primaryContactId: null,
          stage: "negotiate",
          probabilityPct: 75,
          amount: "50000.00",
          currency: "USD",
          ownerUserId: "user-1",
          ownerName: "Alice",
          salesUnitId: "bu-1",
          description: null,
          closeDate: null,
          lossReason: null,
          customData: {},
          recurring: false,
          recurringSplitKind: null,
          servicePeriodStart: null,
          servicePeriodEnd: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-04-01T00:00:00Z",
        }}
      />,
    )
    fireEvent.click(screen.getByText("Create Opportunity"))
    await waitFor(() => {
      expect(screen.getByText("Edit Opportunity")).toBeInTheDocument()
    })
  })

  it("renders with custom field definitions", () => {
    render(
      <OpportunityForm
        {...defaultProps}
        fieldDefinitions={mockFieldDefinitions}
      />,
    )
    expect(screen.getByText("Create Opportunity")).toBeInTheDocument()
  })

  it("renders with empty field definitions array", () => {
    render(
      <OpportunityForm
        {...defaultProps}
        fieldDefinitions={[]}
      />,
    )
    expect(screen.getByText("Create Opportunity")).toBeInTheDocument()
  })
})
