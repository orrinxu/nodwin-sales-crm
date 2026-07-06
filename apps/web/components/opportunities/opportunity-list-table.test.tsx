import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"

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
    revenueRecognitionUnitId: null,
    billingEntityId: null,
    entitySalesId: null,
    serviceType: null,
    propertyType: null,
    barterValue: null,
    servicePeriodStart: null,
    servicePeriodEnd: null,
    executionDate: null,
    estimatedGrossMarginPct: null,
    countryExecution: null,
    projectType: null,
    revenueCategory: null,
    recurring: false,
    recurringSplitKind: null,
    description: null,
    closeDate: "2026-06-01",
    lossReason: null,
    visibilityTier: "standard",
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
    revenueRecognitionUnitId: null,
    billingEntityId: null,
    entitySalesId: null,
    serviceType: null,
    propertyType: null,
    barterValue: null,
    servicePeriodStart: null,
    servicePeriodEnd: null,
    executionDate: null,
    estimatedGrossMarginPct: null,
    countryExecution: null,
    projectType: null,
    revenueCategory: null,
    recurring: false,
    recurringSplitKind: null,
    description: null,
    closeDate: null,
    lossReason: null,
    visibilityTier: "standard",
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
    revenueRecognitionUnitId: null,
    billingEntityId: null,
    entitySalesId: null,
    serviceType: null,
    propertyType: null,
    barterValue: null,
    servicePeriodStart: null,
    servicePeriodEnd: null,
    executionDate: null,
    estimatedGrossMarginPct: null,
    countryExecution: null,
    projectType: null,
    revenueCategory: null,
    recurring: false,
    recurringSplitKind: null,
    description: null,
    closeDate: "2026-03-15",
    lossReason: "Budget",
    visibilityTier: "standard",
    customData: {},
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-03-20T00:00:00Z",
  },
]

vi.mock("server-only", () => ({}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
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

    // Scope to the table so the labelled FilterBar controls (which also render
    // "Stage"/"Owner" text) don't cause ambiguous matches.
    const headerLabels = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent ?? "")
    for (const label of ["Name", "Account", "Stage", "Amount", "Owner", "Close Date"]) {
      expect(headerLabels.some((text) => text.includes(label))).toBe(true)
    }
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

  it("filters the list by search query", async () => {
    const user = userEvent.setup()
    render(
      <OpportunityListTable
        opportunities={mockOpportunities}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
      />,
    )

    await user.type(screen.getByPlaceholderText("Search opportunities..."), "Big")

    expect(screen.getByText("Big Deal")).toBeTruthy()
    expect(screen.queryByText("Small Deal")).toBeNull()
    expect(screen.queryByText("Lost Deal")).toBeNull()
  })

  it("matches search against the account name too", async () => {
    const user = userEvent.setup()
    render(
      <OpportunityListTable
        opportunities={mockOpportunities}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
      />,
    )

    await user.type(screen.getByPlaceholderText("Search opportunities..."), "Gamma")

    expect(screen.getByText("Lost Deal")).toBeTruthy()
    expect(screen.queryByText("Big Deal")).toBeNull()
  })

  it("shows the no-match empty state and clears filters", async () => {
    const user = userEvent.setup()
    render(
      <OpportunityListTable
        opportunities={mockOpportunities}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
      />,
    )

    await user.type(screen.getByPlaceholderText("Search opportunities..."), "zzzz")
    expect(screen.getByText("No opportunities match your filters.")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /clear/i }))
    expect(screen.getByText("Big Deal")).toBeTruthy()
    expect(screen.getByText("Small Deal")).toBeTruthy()
  })

  it("sorts by amount ascending when the Amount header is clicked", async () => {
    const user = userEvent.setup()
    render(
      <OpportunityListTable
        opportunities={mockOpportunities}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
      />,
    )

    await user.click(screen.getByRole("button", { name: /amount/i }))

    const rowText = screen.getAllByRole("row").map((r) => r.textContent ?? "")
    const idx = (name: string) => rowText.findIndex((t) => t.includes(name))
    // ascending by amount: Small ($5k) < Big ($50k) < Lost (EUR 100k)
    expect(idx("Small Deal")).toBeLessThan(idx("Big Deal"))
    expect(idx("Big Deal")).toBeLessThan(idx("Lost Deal"))
  })

})
