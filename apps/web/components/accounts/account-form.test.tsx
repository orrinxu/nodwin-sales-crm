import { describe, it, expect, vi } from "vitest"
import { AccountForm } from "./account-form"
import type { UserOption } from "@/lib/data/users"

vi.mock("server-only", () => ({}))

const mockUsers: UserOption[] = [
  { id: "user-1", fullName: "Alice Johnson" },
  { id: "user-2", fullName: "Bob Smith" },
]

const defaultProps = {
  industries: ["Technology", "Finance", "Healthcare"],
  users: mockUsers,
  createAction: vi.fn(),
  onSuccess: vi.fn(),
}

describe("AccountForm", () => {
  it("renders create mode without throwing", () => {
    expect(() => <AccountForm {...defaultProps} />).not.toThrow()
  })

  it("renders edit mode without throwing", () => {
    expect(() => (
      <AccountForm
        {...defaultProps}
        account={{
          id: "acct-1",
          name: "Acme Corp",
          legalName: null,
          website: "https://acme.com",
          country: "US",
          industry: "Technology",
          description: "A tech company",
          accountOwnerUserId: "user-1",
          ownerName: "Alice Johnson",
          emailDomains: ["acme.com"],
          customData: {},
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-15T00:00:00Z",
        }}
        updateAction={vi.fn()}
      />
    )).not.toThrow()
  })

  it("renders with minimal props", () => {
    expect(() => (
      <AccountForm
        industries={[]}
        users={[]}
        createAction={vi.fn()}
        onSuccess={vi.fn()}
      />
    )).not.toThrow()
  })
})
