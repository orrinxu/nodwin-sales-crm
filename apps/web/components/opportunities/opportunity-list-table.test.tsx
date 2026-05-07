import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { OpportunityRecord } from "@/lib/data/opportunities"

const mockOpportunities: OpportunityRecord[] = [
  {
    id: "opp-1",
    name: "Big Deal",
    accountId: "acct-1",
    accountName: "Acme Corp",
    primaryContactId: null,
    stage: "propose",
    probabilityPct: 60,
    amount: "50000.00",
    currency: "USD",
    ownerUserId: "user-1",
    ownerName: "Alice Johnson",
    salesUnitId: "unit-1",
    description: null,
    closeDate: "2026-06-01",
    lossReason: null,
    customData: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
  },
  {
    id: "opp-2",
    name: "Small Deal",
    accountId: "acct-2",
    accountName: "Beta Inc",
    primaryContactId: null,
    stage: "qualify",
    probabilityPct: 20,
    amount: "5000.00",
    currency: "USD",
    ownerUserId: "user-1",
    ownerName: "Alice Johnson",
    salesUnitId: "unit-1",
    description: null,
    closeDate: null,
    lossReason: null,
    customData: {},
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-04-15T00:00:00Z",
  },
  {
    id: "opp-3",
    name: "Lost Deal",
    accountId: "acct-3",
    accountName: "Gamma LLC",
    primaryContactId: null,
    stage: "closed_lost",
    probabilityPct: 0,
    amount: "100000.00",
    currency: "EUR",
    ownerUserId: "user-2",
    ownerName: "Bob Smith",
    salesUnitId: "unit-1",
    description: null,
    closeDate: "2026-03-15",
    lossReason: "Budget",
    customData: {},
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-03-20T00:00:00Z",
  },
]

vi.mock("server-only", () => ({}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { OpportunityListTable } from "./opportunity-list-table"

describe("OpportunityListTable", () => {
  const bulkDeleteAction = vi.fn()
  const bulkUpdateStageAction = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders all opportunities", () => {
    render(
      <OpportunityListTable
        opportunities={mockOpportunities}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
      />,
    )

    expect(screen.getByText("Big Deal")).toBeTruthy()
    expect(screen.getByText("Small Deal")).toBeTruthy()
    expect(screen.getByText("Lost Deal")).toBeTruthy()
  })

  it("renders column headers", () => {
    render(
      <OpportunityListTable
        opportunities={mockOpportunities}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
      />,
    )

    expect(screen.getByText("Name")).toBeTruthy()
    expect(screen.getByText("Account")).toBeTruthy()
    expect(screen.getByText("Stage")).toBeTruthy()
    expect(screen.getByText("Amount")).toBeTruthy()
    expect(screen.getByText("Owner")).toBeTruthy()
    expect(screen.getByText("Close Date")).toBeTruthy()
  })

  it("renders empty state when no opportunities", () => {
    render(
      <OpportunityListTable
        opportunities={[]}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
      />,
    )

    expect(
      screen.getByText("No opportunities yet. Create one to get started."),
    ).toBeTruthy()
  })

  it("renders stage labels correctly", () => {
    render(
      <OpportunityListTable
        opportunities={mockOpportunities}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
      />,
    )

    expect(screen.getByText("Propose")).toBeTruthy()
    expect(screen.getByText("Qualify")).toBeTruthy()
    expect(screen.getByText("Closed Lost")).toBeTruthy()
  })

  it("formats currency amounts", () => {
    render(
      <OpportunityListTable
        opportunities={mockOpportunities}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
      />,
    )

    expect(screen.getByText("$50,000.00")).toBeTruthy()
    expect(screen.getByText("$5,000.00")).toBeTruthy()
    // EUR amount
    expect(screen.getByText("€100,000.00")).toBeTruthy()
  })

  it("shows '—' for null close date", () => {
    render(
      <OpportunityListTable
        opportunities={mockOpportunities}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
      />,
    )

    const dashes = screen.getAllByText("—")
    expect(dashes.length).toBeGreaterThan(0)
  })

  it("shows bulk action bar when items are selected", async () => {
    const user = userEvent.setup()

    render(
      <OpportunityListTable
        opportunities={mockOpportunities}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
      />,
    )

    const checkboxes = screen.getAllByRole("checkbox")
    // First checkbox is "select all", second is row 1
    await user.click(checkboxes[1])

    expect(screen.getByText("1 selected")).toBeTruthy()
    expect(screen.getByText("Change Stage")).toBeTruthy()
    expect(screen.getByText("Delete")).toBeTruthy()
  })

  it("selects all rows when header checkbox is clicked", async () => {
    const user = userEvent.setup()

    render(
      <OpportunityListTable
        opportunities={mockOpportunities}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
      />,
    )

    const checkboxes = screen.getAllByRole("checkbox")
    // Click "select all"
    await user.click(checkboxes[0])

    expect(screen.getByText("3 selected")).toBeTruthy()
  })
})
