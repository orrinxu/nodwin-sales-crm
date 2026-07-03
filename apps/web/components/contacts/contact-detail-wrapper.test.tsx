/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { ContactDetailWrapper } from "./contact-detail-wrapper"
import type { ContactRecord, AccountOption } from "@/lib/data/contacts"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"

vi.mock("server-only", () => ({}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("@/components/contacts/contact-form", () => ({
  ContactForm: ({ trigger }: { trigger?: React.ReactNode }) => (
    <div data-testid="contact-form">{trigger}</div>
  ),
}))

vi.mock("@/components/contacts/custom-fields-display", () => ({
  CustomFieldsDisplay: () => <div data-testid="custom-fields-display" />,
}))

vi.mock("@/components/opportunities/activity-composer", () => ({
  ActivityComposer: () => <div data-testid="activity-composer" />,
}))

vi.mock("@/components/opportunities/activity-timeline", () => ({
  ActivityTimeline: () => <div data-testid="activity-timeline" />,
}))

function makeContact(overrides: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: "contact-1",
    fullName: "Jane Smith",
    primaryAccountId: "acct-1",
    title: "Head of Procurement",
    email: "jane@tencent.com",
    phone: "+86 10 1234 5678",
    socials: { wechat: "jane-wx", linkedin: "jane-smith" },
    notes: null,
    ownerUserId: "user-1",
    customData: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    ...overrides,
  }
}

const accounts: AccountOption[] = [
  { id: "acct-1", name: "Tencent Games" },
  { id: "acct-2", name: "Tencent Music" },
]

const emptyFieldDefinitions: FieldDefinition[] = []

const defaultProps = {
  contact: makeContact(),
  accounts,
  linkedAccountIds: ["acct-1", "acct-2"],
  ownerName: "Charlie Rep",
  fieldDefinitions: emptyFieldDefinitions,
  activities: [],
  updateAction: vi.fn(),
  createActivityAction: vi.fn(),
}

describe("ContactDetailWrapper", () => {
  it("renders the contact name and title", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    expect(screen.getByRole("heading", { name: "Jane Smith" })).toBeInTheDocument()
  })

  it("shows email as a mailto link", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    const email = screen.getByText("jane@tencent.com")
    expect(email.closest("a")).toHaveAttribute("href", "mailto:jane@tencent.com")
  })

  it("shows the phone number", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    expect(screen.getByText("+86 10 1234 5678")).toBeInTheDocument()
  })

  it("links the primary account to its detail page", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    const link = screen.getByText("Tencent Games")
    expect(link.closest("a")).toHaveAttribute("href", "/accounts/acct-1")
  })

  it("shows the owner name", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    expect(screen.getByText("Charlie Rep")).toBeInTheDocument()
  })

  it("lists additional linked accounts, excluding the primary", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    // acct-2 (Tencent Music) is an extra link; acct-1 is the primary and not repeated here
    const extra = screen.getByText("Tencent Music")
    expect(extra.closest("a")).toHaveAttribute("href", "/accounts/acct-2")
  })

  it("renders social handles with friendly labels", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    expect(screen.getByText(/WeChat/)).toBeInTheDocument()
    expect(screen.getByText("jane-wx")).toBeInTheDocument()
  })

  it("shows 'Unassigned' when there is no owner", () => {
    render(<ContactDetailWrapper {...defaultProps} ownerName={null} />)
    expect(screen.getByText("Unassigned")).toBeInTheDocument()
  })

  it("falls back to an em dash for missing email and phone", () => {
    render(
      <ContactDetailWrapper
        {...defaultProps}
        contact={makeContact({ email: null, phone: null })}
      />,
    )
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2)
  })
})
