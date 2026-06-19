import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { OpportunityForm } from "./opportunity-form"
import type { AccountOption } from "@/lib/data/contacts"
import type { EntityOption } from "@/components/entity-combobox"

vi.mock("server-only", () => ({}))

const mockAccounts: AccountOption[] = [
  { id: "acct-1", name: "Acme Corp" },
  { id: "acct-2", name: "Globex Inc" },
]

const mockUsers: EntityOption[] = [
  { id: "user-1", name: "Alice" },
  { id: "user-2", name: "Bob" },
]

const mockBusinessUnits = [
  { id: "bu-1", name: "East Asia Sales" },
  { id: "bu-2", name: "India Sales" },
]

const mockOpportunity = {
  id: "opp-1",
  name: "Big Deal",
  accountId: "acct-1",
  accountName: "Acme Corp",
  primaryContactId: null,
  stage: "negotiate" as const,
  probabilityPct: 75,
  amount: "50000.00",
  currency: "USD",
  ownerUserId: "user-1",
  ownerName: "Alice",
  salesUnitId: "bu-1",
  revenueRecognitionUnitId: null,
  billingEntityId: null,
  entitySalesId: null,
  serviceType: null,
  propertyType: null,
  barterValue: null,
  servicePeriodStart: null,
  servicePeriodEnd: null,
  executionDate: null,
  estimatedGrossMarginPct: null,
  countryExecution: null,
  projectType: null,
  revenueCategory: null,
  recurring: false,
  recurringSplitKind: null,
  description: null,
  closeDate: null,
  lossReason: null,
  visibilityTier: "standard" as const,
  customData: {},
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
}

const defaultProps = {
  accounts: mockAccounts,
  businessUnits: mockBusinessUnits,
  createAction: vi.fn(),
  onSuccess: vi.fn(),
}

function setupUser() {
  return userEvent.setup({ pointerEventsCheck: 0 })
}

async function openSheet(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByRole("button", { name: /create opportunity/i }))
}

async function fillRequiredFields(user: ReturnType<typeof setupUser>) {
  await user.type(screen.getByLabelText(/name/i), "Test Deal")

  const allCombos = screen.getAllByRole("combobox")

  // Account — EntityCombobox [0]
  await user.click(allCombos[0])
  await user.click(screen.getByText("Acme Corp"))

  // Sales Unit — Select [2]
  await user.click(allCombos[2])
  await user.click(await screen.findByRole("option", { name: "East Asia Sales" }))
}

describe("OpportunityForm", () => {
  describe("smoke", () => {
    it("renders create mode trigger button", () => {
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

    it("renders edit mode trigger button", async () => {
      const user = setupUser()
      render(
        <OpportunityForm
          {...defaultProps}
          opportunity={mockOpportunity}
          updateAction={vi.fn()}
        />,
      )
      await user.click(screen.getByRole("button", { name: /create opportunity/i }))
      expect(await screen.findByText("Edit Opportunity")).toBeInTheDocument()
    })
  })

  describe("form fields — section A (essentials)", () => {
    it("renders all essential fields when opened", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openSheet(user)

      expect(
        screen.getByRole("heading", { name: "Create Opportunity" }),
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/amount/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/currency/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/close date/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/probability/i)).toBeInTheDocument()
      expect(screen.getByText("More details")).toBeInTheDocument()
    })

    it("shows all combobox controls in section A", async () => {
      const user = setupUser()
      render(
        <OpportunityForm
          {...defaultProps}
          users={mockUsers}
        />,
      )
      await openSheet(user)

      const allCombos = screen.getAllByRole("combobox")
      // [0]=Account, [1]=Contact, [2]=Sales Unit, [3]=Owner, [4]=Stage
      expect(allCombos.length).toBeGreaterThanOrEqual(5)
    })

    it("disables primary contact combobox when no account is selected", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openSheet(user)

      const allCombos = screen.getAllByRole("combobox")
      const contactCombo = allCombos[1]
      expect(contactCombo).toBeDisabled()
      expect(
        screen.getByText(/select an account first/i),
      ).toBeInTheDocument()
    })

    it("enables primary contact combobox when account is selected", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openSheet(user)

      const allCombos = screen.getAllByRole("combobox")
      // Select an account
      await user.click(allCombos[0])
      await user.click(screen.getByText("Acme Corp"))

      await waitFor(() => {
        const refreshedCombos = screen.getAllByRole("combobox")
        expect(refreshedCombos[1]).not.toBeDisabled()
      })
      expect(
        screen.queryByText(/select an account first/i),
      ).not.toBeInTheDocument()
    })

    it("clears primary contact when account changes", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openSheet(user)

      let allCombos = screen.getAllByRole("combobox")
      await user.click(allCombos[0])
      await user.click(screen.getByText("Acme Corp"))

      // Now change account to Globex
      allCombos = screen.getAllByRole("combobox")
      await user.click(allCombos[0])
      await user.click(screen.getByText("Globex Inc"))

      // Primary contact should be empty (showing placeholder text)
      await waitFor(() => {
        allCombos = screen.getAllByRole("combobox")
        expect(allCombos[1].textContent).toContain("Select contact")
      })
    })
  })

  describe("progressive disclosure", () => {
    it("hides section B fields by default", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openSheet(user)

      expect(screen.queryByText("Service Start")).not.toBeInTheDocument()
      expect(screen.queryByText("Country of Execution")).not.toBeInTheDocument()
    })

    it("reveals section B fields when 'More details' clicked", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openSheet(user)

      await user.click(screen.getByText("More details"))

      expect(screen.getByText("Service Start")).toBeInTheDocument()
      expect(screen.getByText("Service End")).toBeInTheDocument()
      expect(screen.getByText("Execution Date")).toBeInTheDocument()
      expect(screen.getByText("Estimated Gross Margin (%)")).toBeInTheDocument()
      expect(screen.getByText("Country of Execution")).toBeInTheDocument()
      expect(screen.getByText("Project Type")).toBeInTheDocument()
      expect(screen.getByText("Revenue Category")).toBeInTheDocument()
      expect(screen.getByText("Recurring")).toBeInTheDocument()
      expect(screen.getByText("Visibility Tier")).toBeInTheDocument()
      expect(screen.getByText("Description")).toBeInTheDocument()
    })

    it("hides section B fields when toggled back", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openSheet(user)

      await user.click(screen.getByText("More details"))
      expect(screen.getByText("Service Start")).toBeInTheDocument()

      await user.click(screen.getByText("More details"))
      await waitFor(() => {
        expect(screen.queryByText("Service Start")).not.toBeInTheDocument()
      })
    })
  })

  describe("stage → probability auto-fill", () => {
    it("defaults to qualify (10%) on create", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openSheet(user)

      const probInput = screen.getByLabelText(/probability/i) as HTMLInputElement
      expect(probInput.value).toBe("10")
    })

    const stageProbabilityMap = [
      { stage: "Qualify", value: "10" },
      { stage: "Meet & Present", value: "25" },
      { stage: "Propose", value: "50" },
      { stage: "Negotiate", value: "75" },
      { stage: "Verbal Agreement", value: "90" },
      { stage: "Closed Won", value: "100" },
      { stage: "Closed Lost", value: "0" },
    ]

    it.each(stageProbabilityMap)(
      "sets probability to $value when stage is '$stage'",
      async ({ stage, value }) => {
        const user = setupUser()
        render(<OpportunityForm {...defaultProps} />)
        await openSheet(user)

        // Stage is combobox[4]
        const allCombos = screen.getAllByRole("combobox")
        await user.click(allCombos[4])
        await user.click(await screen.findByRole("option", { name: stage }))

        await waitFor(() => {
          const probInput = screen.getByLabelText(/probability/i) as HTMLInputElement
          expect(probInput.value).toBe(value)
        })
      },
    )
  })

  describe("recurring toggle", () => {
    async function expandSectionB(user: ReturnType<typeof setupUser>) {
      await openSheet(user)
      await user.click(screen.getByText("More details"))
    }

    it("hides recurring split kind when recurring is off", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await expandSectionB(user)

      expect(screen.queryByText("Recurring Split Kind")).not.toBeInTheDocument()
    })

    it("reveals recurring split kind when recurring is enabled", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await expandSectionB(user)

      const recurringCheckbox = screen.getByRole("checkbox")
      await user.click(recurringCheckbox)

      expect(screen.getByText("Recurring Split Kind")).toBeInTheDocument()
    })

    it("hides recurring split kind when toggled back off", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await expandSectionB(user)

      const checkbox = screen.getByRole("checkbox")
      await user.click(checkbox)
      expect(screen.getByText("Recurring Split Kind")).toBeInTheDocument()

      await user.click(checkbox)
      await waitFor(() => {
        expect(
          screen.queryByText("Recurring Split Kind"),
        ).not.toBeInTheDocument()
      })
    })

    it("shows validation error when recurring is on but no split kind selected", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await expandSectionB(user)

      const checkbox = screen.getByRole("checkbox")
      await user.click(checkbox)

      expect(screen.getByText("Recurring Split Kind")).toBeInTheDocument()

      await fillRequiredFields(user)

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/recurring split kind is required/i),
        ).toBeInTheDocument()
      })
    })
  })

  describe("validation", () => {
    it("shows required errors when submitting empty form", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openSheet(user)

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      await waitFor(() => {
        expect(screen.getByText("Name is required")).toBeInTheDocument()
        expect(screen.getByText("Account is required")).toBeInTheDocument()
        expect(screen.getByText("Sales unit is required")).toBeInTheDocument()
      })
    })

    it("disables submit button during pending state", async () => {
      const createAction = vi.fn(
        () => new Promise((resolve) => setTimeout(() => resolve({ id: "opp-new" }), 100)),
      )
      const user = setupUser()
      render(
        <OpportunityForm {...defaultProps} createAction={createAction} />,
      )
      await openSheet(user)
      await fillRequiredFields(user)

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      await waitFor(() => {
        expect(screen.getByText("Saving...")).toBeInTheDocument()
      })
    })
  })

  describe("submission — create", () => {
    it("calls createAction with correct data and calls onSuccess", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-new" })
      const onSuccess = vi.fn()
      const user = setupUser()
      render(
        <OpportunityForm
          {...defaultProps}
          createAction={createAction}
          onSuccess={onSuccess}
          users={mockUsers}
        />,
      )
      await openSheet(user)
      await fillRequiredFields(user)

      // Select owner
      const allCombos = screen.getAllByRole("combobox")
      await user.click(allCombos[3])
      await user.click(screen.getByText("Alice"))

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      await waitFor(() => {
        expect(createAction).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "Test Deal",
            accountId: "acct-1",
            salesUnitId: "bu-1",
            stage: "qualify",
            currency: "USD",
            ownerUserId: "user-1",
          }),
        )
        expect(onSuccess).toHaveBeenCalled()
      })
    })

    it("includes section B fields when provided", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-new" })
      const user = setupUser()
      render(
        <OpportunityForm {...defaultProps} createAction={createAction} />,
      )
      await openSheet(user)
      await fillRequiredFields(user)

      await user.click(screen.getByText("More details"))

      await user.type(screen.getByLabelText(/country of execution/i), "India")
      await user.type(
        screen.getByLabelText("Estimated Gross Margin (%)"),
        "35",
      )

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      await waitFor(() => {
        expect(createAction).toHaveBeenCalledWith(
          expect.objectContaining({
            countryExecution: "India",
            estimatedGrossMarginPct: 35,
          }),
        )
      })
    })

    it("includes recurring split kind when recurring is enabled", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-new" })
      const user = setupUser()
      render(
        <OpportunityForm {...defaultProps} createAction={createAction} />,
      )
      await openSheet(user)
      await fillRequiredFields(user)
      await user.click(screen.getByText("More details"))

      const checkbox = screen.getByRole("checkbox")
      await user.click(checkbox)

      // Recurring Split Kind Select appears — combobox indices shift
      const allCombos = screen.getAllByRole("combobox")
      // [5]=Project Type, [6]=Revenue Category, [7]=Recurring Split Kind, [8]=Visibility Tier
      await user.click(allCombos[7])
      await user.click(await screen.findByRole("option", { name: "Flat" }))

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      await waitFor(() => {
        expect(createAction).toHaveBeenCalledWith(
          expect.objectContaining({
            recurring: true,
            recurringSplitKind: "flat",
          }),
        )
      })
    })
  })

  describe("submission — edit", () => {
    it("calls updateAction with correct id and data", async () => {
      const updateAction = vi.fn().mockResolvedValue(mockOpportunity)
      const onSuccess = vi.fn()
      const user = setupUser()
      render(
        <OpportunityForm
          {...defaultProps}
          opportunity={mockOpportunity}
          updateAction={updateAction}
          onSuccess={onSuccess}
          users={mockUsers}
        />,
      )
      await openSheet(user)

      const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement
      expect(nameInput.value).toBe("Big Deal")

      await user.clear(nameInput)
      await user.type(nameInput, "Updated Deal")

      await user.click(screen.getByRole("button", { name: /save changes/i }))

      await waitFor(() => {
        expect(updateAction).toHaveBeenCalledWith(
          "opp-1",
          expect.objectContaining({ name: "Updated Deal" }),
        )
        expect(onSuccess).toHaveBeenCalled()
      })
    })

    it("does not call createAction in edit mode", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-1" })
      const updateAction = vi.fn().mockResolvedValue(mockOpportunity)
      const user = setupUser()
      render(
        <OpportunityForm
          {...defaultProps}
          opportunity={mockOpportunity}
          createAction={createAction}
          updateAction={updateAction}
        />,
      )
      await openSheet(user)

      // Edit form is pre-filled — just change name and submit
      const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement
      await user.clear(nameInput)
      await user.type(nameInput, "Changed Name")

      await user.click(screen.getByRole("button", { name: /save changes/i }))

      await waitFor(() => {
        expect(updateAction).toHaveBeenCalled()
        expect(createAction).not.toHaveBeenCalled()
      })
    })
  })

  describe("error handling", () => {
    it("displays error message when createAction throws", async () => {
      const createAction = vi
        .fn()
        .mockRejectedValue(new Error("Server error"))
      const user = setupUser()
      render(
        <OpportunityForm {...defaultProps} createAction={createAction} />,
      )
      await openSheet(user)
      await fillRequiredFields(user)

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      expect(await screen.findByText("Server error")).toBeInTheDocument()
    })

    it("shows generic message for non-Error rejections", async () => {
      const createAction = vi.fn().mockRejectedValue("something broke")
      const user = setupUser()
      render(
        <OpportunityForm {...defaultProps} createAction={createAction} />,
      )
      await openSheet(user)
      await fillRequiredFields(user)

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      expect(
        await screen.findByText("An unexpected error occurred"),
      ).toBeInTheDocument()
    })
  })

  describe("visibility tier", () => {
    it("defaults to 'standard' visibility tier", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-new" })
      const user = setupUser()
      render(
        <OpportunityForm {...defaultProps} createAction={createAction} />,
      )
      await openSheet(user)
      await fillRequiredFields(user)

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      await waitFor(() => {
        expect(createAction).toHaveBeenCalledWith(
          expect.objectContaining({ visibilityTier: "standard" }),
        )
      })
    })
  })

  describe("new fields — section B", () => {
    async function expandSectionB(user: ReturnType<typeof setupUser>) {
      await openSheet(user)
      await user.click(screen.getByText("More details"))
    }

    it("renders Billing Entity select", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await expandSectionB(user)
      expect(screen.getByText("Billing Entity")).toBeInTheDocument()
    })

    it("renders Entity Sales select", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await expandSectionB(user)
      expect(screen.getByText("Entity Sales")).toBeInTheDocument()
    })

    it("renders Barter Value input", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await expandSectionB(user)
      expect(screen.getByText("Barter Value")).toBeInTheDocument()
    })

    it("renders Service Type DualListbox", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await expandSectionB(user)
      expect(screen.getByText("Service Type")).toBeInTheDocument()
    })

    it("renders Property Type select", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await expandSectionB(user)
      expect(screen.getByText("Property Type")).toBeInTheDocument()
    })

    it("submits billing entity, entity sales, barter value", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-new" })
      const user = setupUser()
      render(
        <OpportunityForm {...defaultProps} createAction={createAction} />,
      )
      await openSheet(user)
      await fillRequiredFields(user)
      await user.click(screen.getByText("More details"))

      const barterInput = screen.getByLabelText("Barter Value")
      await user.type(barterInput, "5000")
      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      await waitFor(() => {
        expect(createAction).toHaveBeenCalledWith(
          expect.objectContaining({ barterValue: "5000" }),
        )
      })
    })

    it("shows loss reason field when stage is closed_lost in edit mode", async () => {
      const user = setupUser()
      render(
        <OpportunityForm
          {...defaultProps}
          opportunity={{ ...mockOpportunity, stage: "closed_lost" as const }}
          updateAction={vi.fn()}
        />,
      )
      await openSheet(user)
      await user.click(screen.getByText("More details"))

      expect(screen.getByText("Loss Reason")).toBeInTheDocument()
    })

    it("hides loss reason when stage is not closed_lost", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openSheet(user)
      await user.click(screen.getByText("More details"))

      expect(screen.queryByText("Loss Reason")).not.toBeInTheDocument()
    })
  })

  describe("currency", () => {
    it("defaults to USD", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-new" })
      const user = setupUser()
      render(
        <OpportunityForm {...defaultProps} createAction={createAction} />,
      )
      await openSheet(user)
      await fillRequiredFields(user)

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      await waitFor(() => {
        expect(createAction).toHaveBeenCalledWith(
          expect.objectContaining({ currency: "USD" }),
        )
      })
    })
  })
})
