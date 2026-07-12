/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

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

// Detail body is split into Details / Activity tabs; the header stat strip and
// the Details tab both surface the core contact facts (so they appear twice).
const openTab = (name: string | RegExp) => fireEvent.click(screen.getByRole("tab", { name }))

describe("ContactDetailWrapper", () => {
  it("renders the contact name heading and Details/Activity tabs", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    expect(screen.getByRole("heading", { name: "Jane Smith" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Details" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Activity" })).toBeInTheDocument()
  })

  it("shows email as a mailto link", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    expect(screen.getAllByText("jane@tencent.com")[0].closest("a")).toHaveAttribute("href", "mailto:jane@tencent.com")
  })

  it("shows the phone number", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    expect(screen.getAllByText("+86 10 1234 5678").length).toBeGreaterThanOrEqual(1)
  })

  it("links the primary account to its detail page", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    expect(screen.getAllByText("Tencent Games")[0].closest("a")).toHaveAttribute("href", "/accounts/acct-1")
  })

  it("shows the owner name", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    expect(screen.getAllByText("Charlie Rep").length).toBeGreaterThanOrEqual(1)
  })

  it("lists additional linked accounts on the Details tab, excluding the primary", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    const extra = screen.getByText("Tencent Music")
    expect(extra.closest("a")).toHaveAttribute("href", "/accounts/acct-2")
  })

  it("renders social handles with friendly labels on the Details tab", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    expect(screen.getByText(/WeChat/)).toBeInTheDocument()
    expect(screen.getByText("jane-wx")).toBeInTheDocument()
  })

  it("shows 'Unassigned' when there is no owner", () => {
    render(<ContactDetailWrapper {...defaultProps} ownerName={null} />)
    expect(screen.getAllByText("Unassigned").length).toBeGreaterThanOrEqual(1)
  })

  it("falls back to an em dash for missing email and phone", () => {
    render(
      <ContactDetailWrapper {...defaultProps} contact={makeContact({ email: null, phone: null })} />,
    )
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2)
  })

  it("shows the Notes composer on the Activity tab", () => {
    render(<ContactDetailWrapper {...defaultProps} />)
    openTab("Activity")
    expect(screen.getByText("Notes")).toBeInTheDocument()
    expect(screen.getByTestId("activity-composer")).toBeInTheDocument()
  })
})
