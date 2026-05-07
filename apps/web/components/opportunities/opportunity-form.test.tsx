import { describe, it, expect, vi } from "vitest"
import { OpportunityForm } from "./opportunity-form"
import type { AccountOption } from "@/lib/data/contacts"

vi.mock("server-only", () => ({}))

const mockAccounts: AccountOption[] = [
  { id: "acct-1", name: "Acme Corp" },
  { id: "acct-2", name: "Globex Inc" },
]

const mockBusinessUnits = [
  { id: "bu-1", name: "East Asia Sales" },
  { id: "bu-2", name: "India Sales" },
]

const defaultProps = {
  accounts: mockAccounts,
  businessUnits: mockBusinessUnits,
  createAction: vi.fn(),
  onSuccess: vi.fn(),
}

describe("OpportunityForm", () => {
  it("renders create mode without throwing", () => {
    expect(() => <OpportunityForm {...defaultProps} />).not.toThrow()
  })

  it("renders with minimal props", () => {
    expect(() => (
      <OpportunityForm
        accounts={[]}
        businessUnits={[]}
        createAction={vi.fn()}
        onSuccess={vi.fn()}
      />
    )).not.toThrow()
  })
})
