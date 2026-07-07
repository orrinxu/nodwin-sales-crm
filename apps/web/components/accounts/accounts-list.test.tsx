/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AccountsList } from "./accounts-list"
import type { AccountListRecord } from "@/lib/data/accounts"

vi.mock("server-only", () => ({}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// Stub the create/edit form — this test is about row selection, not the form.
vi.mock("@/components/accounts/account-form", () => ({
  AccountForm: () => <div data-testid="account-form" />,
}))

function makeAccount(overrides: Partial<AccountListRecord> & { id: string; name: string }): AccountListRecord {
  return {
    legalName: null,
    website: null,
    country: null,
    industry: null,
    description: null,
    accountOwnerUserId: null,
    emailDomains: [],
    customData: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: "user-1",
    updatedBy: "user-1",
    deletedAt: null,
    ownerName: null,
    contactCount: 0,
    opportunityCount: 0,
    ...overrides,
  }
}

const accounts: AccountListRecord[] = [
  makeAccount({ id: "a-id", name: "Apple" }),
  makeAccount({ id: "b-id", name: "Banana" }),
  makeAccount({ id: "c-id", name: "Cherry" }),
]

function renderList(bulkDeleteAction = vi.fn()) {
  render(
    <AccountsList
      accounts={accounts}
      industryOptions={[]}
      ownerOptions={[]}
      accountOptions={[]}
      createAction={vi.fn()}
      bulkDeleteAction={bulkDeleteAction}
    />,
  )
  return { bulkDeleteAction }
}

describe("AccountsList row selection", () => {
  it("keeps selection bound to the account id after the list is filtered", async () => {
    const user = userEvent.setup()
    const { bulkDeleteAction } = renderList()

    // Select the first visible row (Apple, a-id).
    const rowCheckboxes = screen.getAllByLabelText("Select row")
    await user.click(rowCheckboxes[0])
    expect(screen.getByText("1 selected")).toBeInTheDocument()

    // Filter so only Banana (b-id) remains — Apple leaves the visible set and
    // Banana now occupies index 0. An index-keyed selection would resolve to
    // Banana; an id-keyed selection must still resolve to Apple.
    await user.type(screen.getByPlaceholderText("Search accounts..."), "Banana")

    // Confirm the bulk delete.
    await user.click(screen.getByRole("button", { name: "Delete" }))
    const dialogButtons = screen.getAllByRole("button", { name: "Delete" })
    await user.click(dialogButtons[dialogButtons.length - 1])

    expect(bulkDeleteAction).toHaveBeenCalledTimes(1)
    expect(bulkDeleteAction).toHaveBeenCalledWith({ ids: ["a-id"] })
  })
})
