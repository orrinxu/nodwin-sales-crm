/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AccountsList } from "./accounts-list"
import type { AccountListRecord } from "@/lib/data/accounts"

vi.mock("server-only", () => ({}))

const pushMock = vi.fn()
let currentSearch = ""

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  usePathname: () => "/accounts",
  useSearchParams: () => new URLSearchParams(currentSearch),
}))

// Stub the create/edit form — this test is about the list, not the form.
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

function renderList(props: Partial<React.ComponentProps<typeof AccountsList>> = {}) {
  const bulkDeleteAction = vi.fn()
  render(
    <AccountsList
      accounts={accounts}
      totalCount={3}
      page={1}
      pageSize={25}
      industryOptions={[]}
      ownerOptions={[]}
      accountOptions={[]}
      createAction={vi.fn()}
      bulkDeleteAction={bulkDeleteAction}
      {...props}
    />,
  )
  return { bulkDeleteAction }
}

describe("AccountsList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentSearch = ""
  })

  it("bulk-deletes with the id-keyed selection", async () => {
    const user = userEvent.setup()
    const { bulkDeleteAction } = renderList()

    // Row selection is keyed by account id (getRowId=row.id), not row index.
    const rowCheckboxes = screen.getAllByLabelText("Select row")
    await user.click(rowCheckboxes[0])
    expect(screen.getByText("1 selected")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Delete" }))
    const dialogButtons = screen.getAllByRole("button", { name: "Delete" })
    await user.click(dialogButtons[dialogButtons.length - 1])

    expect(bulkDeleteAction).toHaveBeenCalledTimes(1)
    expect(bulkDeleteAction).toHaveBeenCalledWith({ ids: ["a-id"] })
  })

  it("pushes a debounced ?q= to the URL when searching (server-driven)", async () => {
    const user = userEvent.setup()
    renderList()
    await user.type(screen.getByPlaceholderText("Search accounts..."), "Banana")
    await vi.waitFor(
      () => {
        expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("q=Banana"))
      },
      { timeout: 1500 },
    )
  })

  it("pushes a sort param when a sortable header is clicked", async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole("button", { name: /sort by name/i }))
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringMatching(/sort=name.*dir=asc|dir=asc.*sort=name/),
    )
  })

  it("renders the pagination summary and pushes the next page", async () => {
    const user = userEvent.setup()
    renderList({ totalCount: 60, page: 1, pageSize: 25 })
    expect(screen.getByText(/1–25 of 60 accounts/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /next page/i }))
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("page=2"))
  })
})
