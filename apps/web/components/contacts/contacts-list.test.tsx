import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ContactsList } from "./contacts-list"
import type { AccountOption, ContactRecord } from "@/lib/data/contacts"

const mockPush = vi.fn()
const mockSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}))

const mockAccounts: AccountOption[] = [
  { id: "acct-1", name: "Acme Corp" },
]

const mockContacts: ContactRecord[] = [
  {
    id: "c1",
    fullName: "Alice Johnson",
    primaryAccountId: "acct-1",
    title: "CEO",
    email: "alice@acme.com",
    phone: "+1-555-0100",
    socials: {},
    notes: null,
    ownerUserId: null,
    status: "active",
    customData: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "c2",
    fullName: "Bob Smith",
    primaryAccountId: null,
    title: null,
    email: "bob@example.com",
    phone: null,
    socials: {},
    notes: null,
    ownerUserId: null,
    status: "inactive",
    customData: {},
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-05-15T00:00:00Z",
  },
  {
    id: "c3",
    fullName: "Charlie Brown",
    primaryAccountId: null,
    title: "Designer",
    email: null,
    phone: null,
    socials: {},
    notes: null,
    ownerUserId: null,
    status: "lead",
    customData: {},
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-04-10T00:00:00Z",
  },
]

describe("ContactsList", () => {
  it("renders the page heading", () => {
    render(
      <ContactsList accounts={mockAccounts} contacts={mockContacts} createAction={vi.fn()} />,
    )
    expect(screen.getByText("Contacts")).toBeInTheDocument()
  })

  it("renders contact rows", () => {
    render(
      <ContactsList accounts={mockAccounts} contacts={mockContacts} createAction={vi.fn()} />,
    )
    expect(screen.getByText("Alice Johnson")).toBeInTheDocument()
    expect(screen.getByText("Bob Smith")).toBeInTheDocument()
    expect(screen.getByText("Charlie Brown")).toBeInTheDocument()
  })

  it("renders avatar initials for each contact", () => {
    render(
      <ContactsList accounts={mockAccounts} contacts={mockContacts} createAction={vi.fn()} />,
    )
    expect(screen.getByText("AJ")).toBeInTheDocument()
    expect(screen.getByText("BS")).toBeInTheDocument()
    expect(screen.getByText("CB")).toBeInTheDocument()
  })

  it("renders status badges", () => {
    render(
      <ContactsList accounts={mockAccounts} contacts={mockContacts} createAction={vi.fn()} />,
    )
    expect(screen.getByText("Active")).toBeInTheDocument()
    expect(screen.getByText("Inactive")).toBeInTheDocument()
    expect(screen.getByText("Lead")).toBeInTheDocument()
  })

  it("renders last contact date column", () => {
    render(
      <ContactsList accounts={mockAccounts} contacts={mockContacts} createAction={vi.fn()} />,
    )
    expect(screen.getByText("Jun 1, 2026")).toBeInTheDocument()
    expect(screen.getByText("May 15, 2026")).toBeInTheDocument()
    expect(screen.getByText("Apr 10, 2026")).toBeInTheDocument()
  })

  it("renders email addresses", () => {
    render(
      <ContactsList accounts={mockAccounts} contacts={mockContacts} createAction={vi.fn()} />,
    )
    expect(screen.getByText("alice@acme.com")).toBeInTheDocument()
    expect(screen.getByText("bob@example.com")).toBeInTheDocument()
  })

  it("renders job titles", () => {
    render(
      <ContactsList accounts={mockAccounts} contacts={mockContacts} createAction={vi.fn()} />,
    )
    expect(screen.getByText("CEO")).toBeInTheDocument()
    expect(screen.getByText("Designer")).toBeInTheDocument()
  })

  it("filters contacts by search query", async () => {
    const user = userEvent.setup()
    render(
      <ContactsList accounts={mockAccounts} contacts={mockContacts} createAction={vi.fn()} />,
    )
    const searchInput = screen.getByPlaceholderText("Search contacts...")
    await user.type(searchInput, "alice")
    expect(screen.getByText("Alice Johnson")).toBeInTheDocument()
    expect(screen.queryByText("Bob Smith")).not.toBeInTheDocument()
  })

  it("shows empty state when no contacts exist", () => {
    render(
      <ContactsList accounts={mockAccounts} contacts={[]} createAction={vi.fn()} />,
    )
    expect(screen.getByText("No contacts yet")).toBeInTheDocument()
  })

  it("shows no-matches state when search yields nothing", async () => {
    const user = userEvent.setup()
    render(
      <ContactsList accounts={mockAccounts} contacts={mockContacts} createAction={vi.fn()} />,
    )
    const searchInput = screen.getByPlaceholderText("Search contacts...")
    await user.type(searchInput, "zzzzz")
    expect(screen.getByText("No matching contacts")).toBeInTheDocument()
  })

  it("has a status filter dropdown with all statuses", () => {
    render(
      <ContactsList accounts={mockAccounts} contacts={mockContacts} createAction={vi.fn()} />,
    )
    expect(screen.getByText("All statuses")).toBeInTheDocument()
  })

  it("renders with empty accounts list", () => {
    expect(() =>
      render(
        <ContactsList accounts={[]} contacts={mockContacts} createAction={vi.fn()} />,
      ),
    ).not.toThrow()
  })
})
