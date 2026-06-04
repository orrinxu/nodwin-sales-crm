import { describe, it, expect, vi } from "vitest"
import { ContactForm } from "./contact-form"
import type { AccountOption } from "@/lib/data/contacts"

vi.mock("server-only", () => ({}))

const mockAccounts: AccountOption[] = [
  { id: "acct-1", name: "Acme Corp" },
  { id: "acct-2", name: "Globex Inc" },
]

const defaultProps = {
  accounts: mockAccounts,
  createAction: vi.fn(),
  onSuccess: vi.fn(),
}

describe("ContactForm", () => {
  it("renders create mode without throwing", () => {
    expect(() => <ContactForm {...defaultProps} />).not.toThrow()
  })

  it("renders edit mode without throwing", () => {
    expect(() => (
      <ContactForm
        {...defaultProps}
        contact={{
          id: "contact-1",
          fullName: "John Doe",
          primaryAccountId: "acct-1",
          title: "CEO",
          email: "john@acme.com",
          phone: "+1-555-0000",
          socials: { linkedin: "https://linkedin.com/in/john" },
          notes: "A note",
          ownerUserId: null,
          status: "active",
          customData: {},
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-15T00:00:00Z",
        }}
        linkedAccountIds={["acct-2"]}
        updateAction={vi.fn()}
      />
    )).not.toThrow()
  })

  it("renders with minimal props", () => {
    expect(() => (
      <ContactForm
        accounts={[]}
        createAction={vi.fn()}
        onSuccess={vi.fn()}
      />
    )).not.toThrow()
  })
})
