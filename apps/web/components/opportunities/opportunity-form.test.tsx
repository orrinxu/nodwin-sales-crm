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

// The full editor is now a centered modal. Opening it clicks the default trigger;
// when open, the trigger is inert (modal) so the accessible "Create Opportunity"
// button is the footer submit.
async function openForm(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByRole("button", { name: /create opportunity/i }))
}

// Commercial/legal fields are gated until Propose+. On an early-stage deal they
// are revealed via the "Show commercial & legal fields" escape hatch.
async function revealCommercials(user: ReturnType<typeof setupUser>) {
  const btn = screen.queryByRole("button", { name: /show commercial/i })
  if (btn) await user.click(btn)
}

async function fillRequiredFields(user: ReturnType<typeof setupUser>) {
  await user.type(screen.getByLabelText(/name/i), "Test Deal")

  const allCombos = screen.getAllByRole("combobox")
  // Deal details renders first: [0]=Account, [1]=Contact, [2]=Sales Unit, [3]=Owner, [4]=Stage
  await user.click(allCombos[0])
  await user.click(screen.getByText("Acme Corp"))

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

    it("renders edit mode title when opened", async () => {
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

  describe("deal details (essentials)", () => {
    it("renders all essential fields when opened", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)

      expect(
        screen.getByRole("heading", { name: "Create Opportunity" }),
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/amount/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/currency/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/close date/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/probability/i)).toBeInTheDocument()
    })

    it("shows all combobox controls in deal details", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} users={mockUsers} />)
      await openForm(user)

      const allCombos = screen.getAllByRole("combobox")
      // [0]=Account, [1]=Contact, [2]=Sales Unit, [3]=Owner, [4]=Stage
      expect(allCombos.length).toBeGreaterThanOrEqual(5)
    })

    it("disables primary contact combobox when no account is selected", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)

      const allCombos = screen.getAllByRole("combobox")
      expect(allCombos[1]).toBeDisabled()
      expect(screen.getByText(/select an account first/i)).toBeInTheDocument()
    })

    it("enables primary contact combobox when account is selected", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)

      const allCombos = screen.getAllByRole("combobox")
      await user.click(allCombos[0])
      await user.click(screen.getByText("Acme Corp"))

      await waitFor(() => {
        const refreshedCombos = screen.getAllByRole("combobox")
        expect(refreshedCombos[1]).not.toBeDisabled()
      })
      expect(screen.queryByText(/select an account first/i)).not.toBeInTheDocument()
    })

    it("clears primary contact when account changes", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)

      let allCombos = screen.getAllByRole("combobox")
      await user.click(allCombos[0])
      await user.click(screen.getByText("Acme Corp"))

      allCombos = screen.getAllByRole("combobox")
      await user.click(allCombos[0])
      await user.click(screen.getByText("Globex Inc"))

      await waitFor(() => {
        allCombos = screen.getAllByRole("combobox")
        expect(allCombos[1].textContent).toContain("Select contact")
      })
    })
  })

  describe("progressive disclosure (commercial/legal gated at Propose)", () => {
    it("gates commercial fields on an early-stage deal", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)

      // Commercials section is not rendered at qualify; the escape hatch is shown.
      expect(screen.queryByText("Service Start")).not.toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /show commercial/i }),
      ).toBeInTheDocument()
    })

    it("reveals commercial fields via the escape hatch", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)
      await revealCommercials(user)

      expect(screen.getByText("Service Start")).toBeInTheDocument()
      expect(screen.getByText("Service End")).toBeInTheDocument()
      expect(screen.getByText("Execution Date")).toBeInTheDocument()
      expect(screen.getByText("Estimated Gross Margin (%)")).toBeInTheDocument()
      expect(screen.getByText("Billing Entity")).toBeInTheDocument()
      expect(screen.getByText("Recurring")).toBeInTheDocument()
    })

    it("shows commercial fields immediately once stage is Propose+", async () => {
      const user = setupUser()
      render(
        <OpportunityForm
          {...defaultProps}
          opportunity={mockOpportunity}
          updateAction={vi.fn()}
        />,
      )
      await openForm(user)
      // negotiate ≥ propose → Commercials rendered without the escape hatch.
      expect(screen.queryByRole("button", { name: /show commercial/i })).not.toBeInTheDocument()
      expect(screen.getByText("Billing Entity")).toBeInTheDocument()
    })

    it("keeps classification fields available (mounted) regardless of stage", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)

      expect(screen.getByText("Service Type")).toBeInTheDocument()
      expect(screen.getByText("Property Type")).toBeInTheDocument()
      expect(screen.getByText("Country of Execution")).toBeInTheDocument()
    })
  })

  describe("stage → probability auto-fill", () => {
    it("defaults to qualify (10%) on create", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)

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
        await openForm(user)

        const allCombos = screen.getAllByRole("combobox")
        await user.click(allCombos[4]) // Stage
        await user.click(await screen.findByRole("option", { name: stage }))

        await waitFor(() => {
          const probInput = screen.getByLabelText(/probability/i) as HTMLInputElement
          expect(probInput.value).toBe(value)
        })
      },
    )
  })

  describe("recurring toggle", () => {
    it("hides recurring split kind when recurring is off", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)
      await revealCommercials(user)

      expect(screen.queryByText("Recurring Split Kind")).not.toBeInTheDocument()
    })

    it("reveals recurring split kind when recurring is enabled", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)
      await revealCommercials(user)

      await user.click(screen.getByRole("checkbox", { name: /recurring/i }))
      expect(screen.getByText("Recurring Split Kind")).toBeInTheDocument()
    })

    it("hides recurring split kind when toggled back off", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)
      await revealCommercials(user)

      const checkbox = screen.getByRole("checkbox", { name: /recurring/i })
      await user.click(checkbox)
      expect(screen.getByText("Recurring Split Kind")).toBeInTheDocument()

      await user.click(checkbox)
      await waitFor(() => {
        expect(screen.queryByText("Recurring Split Kind")).not.toBeInTheDocument()
      })
    })

    it("shows validation error when recurring is on but no split kind selected", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)
      await revealCommercials(user)

      await user.click(screen.getByRole("checkbox", { name: /recurring/i }))
      expect(screen.getByText("Recurring Split Kind")).toBeInTheDocument()

      await fillRequiredFields(user)
      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      await waitFor(() => {
        expect(screen.getByText(/recurring split kind is required/i)).toBeInTheDocument()
      })
    })
  })

  describe("validation", () => {
    it("shows required errors when submitting empty form", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)

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
      ) as unknown as typeof defaultProps.createAction
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} createAction={createAction} />)
      await openForm(user)
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
      await openForm(user)
      await fillRequiredFields(user)

      const allCombos = screen.getAllByRole("combobox")
      await user.click(allCombos[3]) // Owner
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

    it("includes classification (country) + commercial (gross margin) fields", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-new" })
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} createAction={createAction} />)
      await openForm(user)
      await fillRequiredFields(user)

      // Country of Execution — searchable multi-select. Expand Classification so
      // its dropdown options aren't inside a collapsed (hidden) panel.
      await user.click(screen.getByRole("button", { name: /classification/i }))
      await user.click(screen.getByPlaceholderText("Add countries..."))
      await user.click(await screen.findByRole("option", { name: "India" }))

      // Estimated Gross Margin — commercial (gated, reveal first)
      await revealCommercials(user)
      await user.type(screen.getByLabelText("Estimated Gross Margin (%)"), "35")

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      await waitFor(() => {
        expect(createAction).toHaveBeenCalledWith(
          expect.objectContaining({
            countryExecution: "IN",
            estimatedGrossMarginPct: 35,
          }),
        )
      })
    })

    it("includes recurring split kind when recurring is enabled", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-new" })
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} createAction={createAction} />)
      await openForm(user)
      await fillRequiredFields(user)
      await revealCommercials(user)

      await user.click(screen.getByRole("checkbox", { name: /recurring/i }))

      // Locate the split-kind Select by its placeholder text, then pick Flat.
      await user.click(screen.getByText("Select split kind"))
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
      await openForm(user)

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
      await openForm(user)

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
      const createAction = vi.fn().mockRejectedValue(new Error("Server error"))
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} createAction={createAction} />)
      await openForm(user)
      await fillRequiredFields(user)

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      expect(await screen.findByText("Server error")).toBeInTheDocument()
    })

    it("shows generic message for non-Error rejections", async () => {
      const createAction = vi.fn().mockRejectedValue("something broke")
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} createAction={createAction} />)
      await openForm(user)
      await fillRequiredFields(user)

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      expect(await screen.findByText("An unexpected error occurred")).toBeInTheDocument()
    })
  })

  describe("visibility tier", () => {
    it("defaults to 'standard' visibility tier", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-new" })
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} createAction={createAction} />)
      await openForm(user)
      await fillRequiredFields(user)

      await user.click(screen.getByRole("button", { name: /create opportunity/i }))

      await waitFor(() => {
        expect(createAction).toHaveBeenCalledWith(
          expect.objectContaining({ visibilityTier: "standard" }),
        )
      })
    })
  })

  describe("classification + commercial fields", () => {
    it("renders Service Type multi-select (classification, always mounted)", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)
      expect(screen.getByText("Service Type")).toBeInTheDocument()
    })

    it("renders Property Type select (classification, always mounted)", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)
      expect(screen.getByText("Property Type")).toBeInTheDocument()
    })

    it("renders Billing Entity, Entity Sales and Barter Value once commercials revealed", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)
      await revealCommercials(user)
      expect(screen.getByText("Billing Entity")).toBeInTheDocument()
      expect(screen.getByText("Entity Sales")).toBeInTheDocument()
      expect(screen.getByText("Barter Value")).toBeInTheDocument()
    })

    it("submits barter value", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-new" })
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} createAction={createAction} />)
      await openForm(user)
      await fillRequiredFields(user)
      await revealCommercials(user)

      await user.type(screen.getByLabelText("Barter Value"), "5000")
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
      await openForm(user)
      // Loss Reason now lives in Deal details, visible without any expansion.
      expect(screen.getByText("Loss Reason")).toBeInTheDocument()
    })

    it("hides loss reason when stage is not closed_lost", async () => {
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} />)
      await openForm(user)
      expect(screen.queryByText("Loss Reason")).not.toBeInTheDocument()
    })
  })

  describe("currency", () => {
    it("defaults to USD", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-new" })
      const user = setupUser()
      render(<OpportunityForm {...defaultProps} createAction={createAction} />)
      await openForm(user)
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
