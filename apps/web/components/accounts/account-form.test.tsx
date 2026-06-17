import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { AccountForm } from "./account-form"
import type { AccountRecord, AccountCreateInput } from "@/lib/data/accounts"

vi.mock("server-only", () => ({}))

const mockOwnerOptions = [
  { id: "user-1", name: "Alice Smith" },
  { id: "user-2", name: "Bob Jones" },
]

const mockAccount: AccountRecord = {
  id: "acct-1",
  name: "Acme Corp",
  legalName: "Acme Corporation Ltd",
  website: "https://acme.com",
  country: "US",
  industry: "Technology",
  description: "A technology company",
  accountOwnerUserId: "user-1",
  emailDomains: ["acme.com", "acme-corp.com"],
  customData: {},
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
  createdBy: null,
  updatedBy: null,
}

const defaultCreateProps = {
  createAction: vi.fn() as (input: AccountCreateInput) => Promise<AccountRecord>,
  onSuccess: vi.fn(),
}

function getSubmitButton() {
  const form = document.querySelector("form")
  if (!form) throw new Error("No form found")
  return within(form).getByRole("button", { name: /create account/i })
}

describe("AccountForm", () => {
  it("renders create mode without throwing", () => {
    expect(() => <AccountForm {...defaultCreateProps} />).not.toThrow()
  })

  it("renders edit mode without throwing", () => {
    expect(() => (
      <AccountForm
        {...defaultCreateProps}
        account={mockAccount}
        ownerOptions={mockOwnerOptions}
        updateAction={vi.fn()}
      />
    )).not.toThrow()
  })

  it("renders with minimal props", () => {
    expect(() => (
      <AccountForm
        createAction={vi.fn() as (input: AccountCreateInput) => Promise<AccountRecord>}
        onSuccess={vi.fn()}
      />
    )).not.toThrow()
  })

  it("renders create trigger button", () => {
    render(<AccountForm {...defaultCreateProps} />)
    expect(screen.getByRole("button", { name: /create account/i })).toBeDefined()
  })

  it("renders custom trigger when provided", () => {
    render(
      <AccountForm
        {...defaultCreateProps}
        trigger={<button>Custom Trigger</button>}
      />
    )
    expect(screen.getByRole("button", { name: /custom trigger/i })).toBeDefined()
  })

  it("opens sheet on trigger click", async () => {
    render(<AccountForm {...defaultCreateProps} />)
    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      const titles = screen.getAllByText("Create Account")
      expect(titles.length).toBeGreaterThanOrEqual(1)
      expect(screen.getByLabelText(/account name/i)).toBeDefined()
    })
  })

  it("opens sheet with edit title when account prop is set", async () => {
    render(
      <AccountForm
        {...defaultCreateProps}
        account={mockAccount}
        updateAction={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText("Edit Account")).toBeDefined()
    })
  })

  it("renders owner select when ownerOptions are provided", async () => {
    render(
      <AccountForm
        {...defaultCreateProps}
        ownerOptions={mockOwnerOptions}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/account owner/i)).toBeDefined()
    })
  })

  it("does not render owner select when ownerOptions is empty", async () => {
    render(<AccountForm {...defaultCreateProps} />)
    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/account name/i)).toBeDefined()
    })

    expect(screen.queryByLabelText(/account owner/i)).toBeNull()
  })

  it("shows validation error for empty name", async () => {
    render(<AccountForm {...defaultCreateProps} />)
    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/account name/i)).toBeDefined()
    })

    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(screen.getByText(/account name is required/i)).toBeDefined()
    })
  })

  it("calls createAction with correct data on submit", async () => {
    const createAction = vi.fn().mockResolvedValue({
      ...mockAccount,
      id: "acct-new",
      name: "New Co",
    })

    render(
      <AccountForm
        createAction={createAction}
        onSuccess={vi.fn()}
        ownerOptions={mockOwnerOptions}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/account name/i)).toBeDefined()
    })

    const nameInput = screen.getByLabelText(/account name/i)
    fireEvent.change(nameInput, { target: { value: "New Co" } })

    const ownerSelect = screen.getByLabelText(/account owner/i)
    fireEvent.change(ownerSelect, { target: { value: "user-1" } })

    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(createAction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Co",
          accountOwnerUserId: "user-1",
        })
      )
    })
  })

  it("calls updateAction when editing", async () => {
    const updateAction = vi.fn().mockResolvedValue(mockAccount)

    render(
      <AccountForm
        {...defaultCreateProps}
        account={mockAccount}
        updateAction={updateAction}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText("Edit Account")).toBeDefined()
    })

    const nameInput = screen.getByLabelText(/account name/i)
    fireEvent.change(nameInput, { target: { value: "Acme Updated" } })

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => {
      expect(updateAction).toHaveBeenCalledWith(
        "acct-1",
        expect.objectContaining({
          name: "Acme Updated",
        })
      )
    })
  })

  it("parses email domains from comma-separated input", async () => {
    const createAction = vi.fn().mockResolvedValue({
      ...mockAccount,
      id: "acct-new",
      name: "Co",
    })

    render(<AccountForm createAction={createAction} onSuccess={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/account name/i)).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText(/account name/i), {
      target: { value: "Co" },
    })
    fireEvent.change(screen.getByLabelText(/email domains/i), {
      target: { value: "a.com, b.com" },
    })

    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(createAction).toHaveBeenCalledWith(
        expect.objectContaining({
          emailDomains: ["a.com", "b.com"],
        })
      )
    })
  })

  it("displays error message on action failure", async () => {
    const createAction = vi.fn().mockRejectedValue(new Error("Server error"))

    render(<AccountForm createAction={createAction} onSuccess={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/account name/i)).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText(/account name/i), {
      target: { value: "Co" },
    })

    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeDefined()
    })
  })

  it("calls onSuccess after successful create", async () => {
    const onSuccess = vi.fn()
    const createAction = vi.fn().mockResolvedValue({
      ...mockAccount,
      id: "acct-new",
      name: "Co",
    })

    render(
      <AccountForm
        createAction={createAction}
        onSuccess={onSuccess}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/account name/i)).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText(/account name/i), {
      target: { value: "Co" },
    })

    fireEvent.click(getSubmitButton())

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
  })
})
