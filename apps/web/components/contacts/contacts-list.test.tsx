/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ContactsList } from "./contacts-list"
import type { ContactListRecord } from "@/lib/data/contacts"

vi.mock("server-only", () => ({}))

const pushMock = vi.fn()
let currentSearch = ""

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  usePathname: () => "/contacts",
  useSearchParams: () => new URLSearchParams(currentSearch),
}))

// Stub the create form — this test is about the list, not the form.
vi.mock("@/components/contacts/contact-form", () => ({
  ContactForm: () => <div data-testid="contact-form" />,
}))

function makeContact(overrides: Partial<ContactListRecord> & { id: string; fullName: string }): ContactListRecord {
  return {
    primaryAccountId: null,
    title: null,
    email: null,
    phone: null,
    socials: {},
    notes: null,
    ownerUserId: null,
    customData: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    primaryAccountName: null,
    ownerName: null,
    ...overrides,
  }
}

const contacts: ContactListRecord[] = [
  makeContact({ id: "ca", fullName: "Anna Apple" }),
  makeContact({ id: "cb", fullName: "Bob Banana" }),
  makeContact({ id: "cc", fullName: "Cara Cherry" }),
]

function renderList(props: Partial<React.ComponentProps<typeof ContactsList>> = {}) {
  const bulkDeleteAction = vi.fn()
  render(
    <ContactsList
      contacts={contacts}
      totalCount={3}
      page={1}
      pageSize={25}
      accounts={[]}
      ownerOptions={[]}
      createAction={vi.fn()}
      bulkDeleteAction={bulkDeleteAction}
      {...props}
    />,
  )
  return { bulkDeleteAction }
}

describe("ContactsList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentSearch = ""
  })

  it("bulk-deletes with the id-keyed selection", async () => {
    const user = userEvent.setup()
    const { bulkDeleteAction } = renderList()

    // Row selection is keyed by contact id (getRowId=row.id), not row index.
    const rowCheckboxes = screen.getAllByLabelText("Select row")
    await user.click(rowCheckboxes[0])
    expect(screen.getByText("1 selected")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Delete" }))
    const dialogButtons = screen.getAllByRole("button", { name: "Delete" })
    await user.click(dialogButtons[dialogButtons.length - 1])

    expect(bulkDeleteAction).toHaveBeenCalledTimes(1)
    expect(bulkDeleteAction).toHaveBeenCalledWith({ ids: ["ca"] })
  })

  it("pushes a debounced ?q= to the URL when searching (server-driven)", async () => {
    const user = userEvent.setup()
    renderList()
    await user.type(screen.getByPlaceholderText("Search contacts..."), "Banana")
    await vi.waitFor(
      () => {
        expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("q=Banana"))
      },
      { timeout: 1500 },
    )
  })

  it("renders the pagination summary and pushes the next page", async () => {
    const user = userEvent.setup()
    renderList({ totalCount: 60, page: 1, pageSize: 25 })
    expect(screen.getByText(/1–25 of 60 contacts/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /next page/i }))
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("page=2"))
  })
})
