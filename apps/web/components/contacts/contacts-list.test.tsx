/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ContactsList } from "./contacts-list"
import type { ContactListRecord } from "@/lib/data/contacts"

vi.mock("server-only", () => ({}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// Stub the create form — this test is about row selection, not the form.
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

function renderList(bulkDeleteAction = vi.fn()) {
  render(
    <ContactsList
      contacts={contacts}
      accounts={[]}
      createAction={vi.fn()}
      bulkDeleteAction={bulkDeleteAction}
    />,
  )
  return { bulkDeleteAction }
}

describe("ContactsList row selection", () => {
  it("keeps selection bound to the contact id after the list is filtered", async () => {
    const user = userEvent.setup()
    const { bulkDeleteAction } = renderList()

    // Select the first visible row (Anna Apple, ca).
    const rowCheckboxes = screen.getAllByLabelText("Select row")
    await user.click(rowCheckboxes[0])
    expect(screen.getByText("1 selected")).toBeInTheDocument()

    // Filter so only Bob Banana (cb) remains — an index-keyed selection would now
    // resolve to Bob; an id-keyed selection must still resolve to Anna.
    await user.type(screen.getByPlaceholderText("Search contacts..."), "Banana")

    // Confirm the bulk delete.
    await user.click(screen.getByRole("button", { name: "Delete" }))
    const dialogButtons = screen.getAllByRole("button", { name: "Delete" })
    await user.click(dialogButtons[dialogButtons.length - 1])

    expect(bulkDeleteAction).toHaveBeenCalledTimes(1)
    expect(bulkDeleteAction).toHaveBeenCalledWith({ ids: ["ca"] })
  })
})
