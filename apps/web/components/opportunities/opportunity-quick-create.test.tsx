import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { OpportunityQuickCreate } from "./opportunity-quick-create"
import type { EntityOption } from "@/components/entity-combobox"

vi.mock("server-only", () => ({}))

const mockAccounts: EntityOption[] = [
  { id: "acct-1", label: "Acme Corp" },
  { id: "acct-2", label: "Globex Inc" },
]

const mockBusinessUnits = [
  { id: "bu-1", name: "East Asia Sales" },
  { id: "bu-2", name: "India Sales" },
]

const defaultProps = {
  accounts: mockAccounts,
  businessUnits: mockBusinessUnits,
  createAction: vi.fn().mockResolvedValue({ id: "opp-1" }),
  onSuccess: vi.fn(),
}

describe("OpportunityQuickCreate", () => {
  describe("smoke", () => {
    it("renders without throwing", () => {
      expect(() => <OpportunityQuickCreate {...defaultProps} />).not.toThrow()
    })

    it("renders with minimal props (empty lists)", () => {
      expect(() => (
        <OpportunityQuickCreate
          accounts={[]}
          businessUnits={[]}
          createAction={vi.fn()}
          onSuccess={vi.fn()}
        />
      )).not.toThrow()
    })

    it("renders with defaultAccountId", () => {
      expect(() => (
        <OpportunityQuickCreate
          {...defaultProps}
          defaultAccountId="acct-1"
        />
      )).not.toThrow()
    })

    it("renders with custom trigger", () => {
      expect(() => (
        <OpportunityQuickCreate
          {...defaultProps}
          trigger={<button type="button">Custom</button>}
        />
      )).not.toThrow()
    })
  })

  describe("validation", () => {
    it("shows validation errors when submitting empty form", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(<OpportunityQuickCreate {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /quick add/i }))

      await user.click(screen.getByRole("button", { name: /create/i }))

      expect(await screen.findByText("Name is required")).toBeInTheDocument()
      expect(screen.getByText("Account is required")).toBeInTheDocument()
      expect(screen.getByText("Sales unit is required")).toBeInTheDocument()
    })

    it("clears validation errors after successful submission", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(<OpportunityQuickCreate {...defaultProps} />)

      await user.click(screen.getByRole("button", { name: /quick add/i }))

      await user.click(screen.getByRole("button", { name: /create/i }))

      expect(await screen.findByText("Name is required")).toBeInTheDocument()

      await user.type(screen.getByLabelText(/name/i), "Test Deal")

      // Account: EntityCombobox — click trigger, then click item text
      const accountCombobox = screen.getAllByRole("combobox")[0]
      await user.click(accountCombobox)
      await user.click(screen.getByText("Acme Corp"))

      const salesUnitTrigger = screen.getByRole("combobox", { name: /sales unit/i })
      await user.click(salesUnitTrigger)
      await user.click(await screen.findByRole("option", { name: "East Asia Sales" }))

      await user.click(screen.getByRole("button", { name: /create/i }))

      expect(screen.queryByText("Name is required")).not.toBeInTheDocument()
    })
  })

  describe("submission", () => {
    it("calls createAction with correct data and resets on success", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-1" })
      const onSuccess = vi.fn()
      const user = userEvent.setup({ pointerEventsCheck: 0 })

      render(
        <OpportunityQuickCreate
          {...defaultProps}
          createAction={createAction}
          onSuccess={onSuccess}
        />,
      )

      await user.click(screen.getByRole("button", { name: /quick add/i }))

      await user.type(screen.getByLabelText(/name/i), "New Deal")

      const accountCombobox = screen.getAllByRole("combobox")[0]
      await user.click(accountCombobox)
      await user.click(screen.getByText("Acme Corp"))

      const salesUnitTrigger = screen.getByRole("combobox", { name: /sales unit/i })
      await user.click(salesUnitTrigger)
      await user.click(await screen.findByRole("option", { name: "East Asia Sales" }))

      await user.click(screen.getByRole("button", { name: /create/i }))

      expect(createAction).toHaveBeenCalledWith({
        name: "New Deal",
        accountId: "acct-1",
        amount: undefined,
        salesUnitId: "bu-1",
        stage: "qualify",
      })
      expect(onSuccess).toHaveBeenCalled()
    })

    it("passes amount as string when provided", async () => {
      const createAction = vi.fn().mockResolvedValue({ id: "opp-1" })
      const user = userEvent.setup({ pointerEventsCheck: 0 })

      render(
        <OpportunityQuickCreate
          {...defaultProps}
          createAction={createAction}
        />,
      )

      await user.click(screen.getByRole("button", { name: /quick add/i }))

      await user.type(screen.getByLabelText(/name/i), "Big Deal")

      const accountCombobox = screen.getAllByRole("combobox")[0]
      await user.click(accountCombobox)
      await user.click(screen.getByText("Globex Inc"))

      const salesUnitTrigger = screen.getByRole("combobox", { name: /sales unit/i })
      await user.click(salesUnitTrigger)
      await user.click(await screen.findByRole("option", { name: "India Sales" }))

      await user.type(screen.getByLabelText(/amount/i), "1500.50")

      await user.click(screen.getByRole("button", { name: /create/i }))

      expect(createAction).toHaveBeenCalledWith({
        name: "Big Deal",
        accountId: "acct-2",
        amount: "1500.50",
        salesUnitId: "bu-2",
        stage: "qualify",
      })
    })
  })

  describe("error handling", () => {
    it("displays error message when createAction throws", async () => {
      const createAction = vi
        .fn()
        .mockRejectedValue(new Error("Account has reached opportunity limit"))
      const user = userEvent.setup({ pointerEventsCheck: 0 })

      render(
        <OpportunityQuickCreate
          {...defaultProps}
          createAction={createAction}
        />,
      )

      await user.click(screen.getByRole("button", { name: /quick add/i }))

      await user.type(screen.getByLabelText(/name/i), "Failing Deal")

      const accountCombobox = screen.getAllByRole("combobox")[0]
      await user.click(accountCombobox)
      await user.click(screen.getByText("Acme Corp"))

      const salesUnitTrigger = screen.getByRole("combobox", { name: /sales unit/i })
      await user.click(salesUnitTrigger)
      await user.click(await screen.findByRole("option", { name: "East Asia Sales" }))

      await user.click(screen.getByRole("button", { name: /create/i }))

      expect(
        await screen.findByText("Account has reached opportunity limit"),
      ).toBeInTheDocument()
    })

    it("shows generic message for non-Error rejections", async () => {
      const createAction = vi.fn().mockRejectedValue("something broke")
      const user = userEvent.setup({ pointerEventsCheck: 0 })

      render(
        <OpportunityQuickCreate
          {...defaultProps}
          createAction={createAction}
        />,
      )

      await user.click(screen.getByRole("button", { name: /quick add/i }))

      await user.type(screen.getByLabelText(/name/i), "Weird Error Deal")

      const accountCombobox = screen.getAllByRole("combobox")[0]
      await user.click(accountCombobox)
      await user.click(screen.getByText("Acme Corp"))

      const salesUnitTrigger = screen.getByRole("combobox", { name: /sales unit/i })
      await user.click(salesUnitTrigger)
      await user.click(await screen.findByRole("option", { name: "East Asia Sales" }))

      await user.click(screen.getByRole("button", { name: /create/i }))

      expect(
        await screen.findByText("An unexpected error occurred"),
      ).toBeInTheDocument()
    })

    it("clears previous error on retry", async () => {
      const createAction = vi
        .fn()
        .mockRejectedValueOnce(new Error("First error"))
        .mockResolvedValueOnce({ id: "opp-2" })
      const user = userEvent.setup({ pointerEventsCheck: 0 })

      render(
        <OpportunityQuickCreate
          {...defaultProps}
          createAction={createAction}
        />,
      )

      await user.click(screen.getByRole("button", { name: /quick add/i }))

      await user.type(screen.getByLabelText(/name/i), "Retry Deal")

      const accountCombobox = screen.getAllByRole("combobox")[0]
      await user.click(accountCombobox)
      await user.click(screen.getByText("Acme Corp"))

      const salesUnitTrigger = screen.getByRole("combobox", { name: /sales unit/i })
      await user.click(salesUnitTrigger)
      await user.click(await screen.findByRole("option", { name: "East Asia Sales" }))

      await user.click(screen.getByRole("button", { name: /create/i }))

      expect(await screen.findByText("First error")).toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: /create/i }))

      expect(screen.queryByText("First error")).not.toBeInTheDocument()
    })
  })
})
