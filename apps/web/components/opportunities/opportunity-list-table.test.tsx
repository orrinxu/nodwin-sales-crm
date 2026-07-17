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
    primaryContactName: null,
    billingEntityName: null,
    entitySalesName: null,
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
    primaryContactName: null,
    billingEntityName: null,
    entitySalesName: null,
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
    primaryContactName: null,
    billingEntityName: null,
    entitySalesName: null,
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

// A controllable next/navigation mock: tests set `currentSearch` (the query
// string the server-driven table reads its filter/sort/page from) and assert on
// `pushMock` (where the table sends filter/sort/page changes).
const pushMock = vi.fn()
let currentSearch = ""

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: pushMock }),
  usePathname: () => "/opportunities",
  useSearchParams: () => new URLSearchParams(currentSearch),
}))

import { OpportunityListTable } from "./opportunity-list-table"

const baseProps = {
  totalCount: 3,
  page: 1,
  pageSize: 25,
  ownerOptions: [
    { id: "user-1", name: "Alice Johnson" },
    { id: "user-2", name: "Bob Smith" },
  ],
}

describe("OpportunityListTable", () => {
  const bulkDeleteAction = vi.fn()
  const bulkUpdateStageAction = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    currentSearch = ""
  })

  function renderTable(
    overrides: Partial<React.ComponentProps<typeof OpportunityListTable>> = {},
  ) {
    return render(
      <OpportunityListTable
        opportunities={mockOpportunities}
        bulkDeleteAction={bulkDeleteAction}
        bulkUpdateStageAction={bulkUpdateStageAction}
        {...baseProps}
        {...overrides}
      />,
    )
  }

  it("renders every provided opportunity (server already paged)", () => {
    renderTable()
    expect(screen.getByText("Big Deal")).toBeTruthy()
    expect(screen.getByText("Small Deal")).toBeTruthy()
    expect(screen.getByText("Lost Deal")).toBeTruthy()
  })

  it("renders column headers", () => {
    renderTable()
    const headerLabels = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent ?? "")
    for (const label of ["Name", "Account", "Stage", "Amount", "Owner", "Close Date"]) {
      expect(headerLabels.some((text) => text.includes(label))).toBe(true)
    }
  })

  it("renders empty state when no opportunities", () => {
    renderTable({ opportunities: [], totalCount: 0 })
    expect(
      screen.getByText("No opportunities yet. Create one to get started."),
    ).toBeTruthy()
  })

  it("renders stage labels correctly", () => {
    renderTable()
    expect(screen.getByText("Propose")).toBeTruthy()
    expect(screen.getByText("Qualify")).toBeTruthy()
    expect(screen.getByText("Closed Lost")).toBeTruthy()
  })

  it("formats currency amounts", () => {
    renderTable()
    expect(screen.getByText("$50,000.00")).toBeTruthy()
    expect(screen.getByText("$5,000.00")).toBeTruthy()
    expect(screen.getByText("€100,000.00")).toBeTruthy()
  })

  it("shows '—' for null close date", () => {
    renderTable()
    const dashes = screen.getAllByText("—")
    expect(dashes.length).toBeGreaterThan(0)
  })

  it("shows bulk action bar when items are selected", async () => {
    const user = userEvent.setup()
    renderTable()
    const checkboxes = screen.getAllByRole("checkbox")
    await user.click(checkboxes[1])
    expect(screen.getByText("1 selected")).toBeTruthy()
    expect(screen.getByText("Change Stage")).toBeTruthy()
    expect(screen.getByText("Delete")).toBeTruthy()
  })

  it("selects all rows when header checkbox is clicked", async () => {
    const user = userEvent.setup()
    renderTable()
    const checkboxes = screen.getAllByRole("checkbox")
    await user.click(checkboxes[0])
    expect(screen.getByText("3 selected")).toBeTruthy()
  })

  it("pushes a debounced ?q= to the URL when searching (server-driven)", async () => {
    const user = userEvent.setup()
    renderTable()
    await user.type(screen.getByPlaceholderText("Search opportunities..."), "Gamma")
    await vi.waitFor(
      () => {
        expect(pushMock).toHaveBeenCalledWith(
          expect.stringContaining("q=Gamma"),
        )
      },
      { timeout: 1500 },
    )
  })

  it("pushes a sort param when a sortable header is clicked", async () => {
    const user = userEvent.setup()
    renderTable()
    await user.click(screen.getByRole("button", { name: /sort by amount/i }))
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringMatching(/sort=amount.*dir=asc|dir=asc.*sort=amount/),
    )
  })

  it("flips sort direction when the active sort header is clicked again", async () => {
    currentSearch = "sort=amount&dir=asc"
    const user = userEvent.setup()
    renderTable()
    await user.click(screen.getByRole("button", { name: /sort by amount/i }))
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("dir=desc"))
  })

  it("clears filters back to a pristine URL", async () => {
    currentSearch = "q=zzzz&stage=propose"
    const user = userEvent.setup()
    renderTable({ opportunities: [], totalCount: 0 })
    expect(screen.getByText("No opportunities match your filters.")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: /clear/i }))
    // Cleared push drops q + stage; nothing filter-related remains.
    const lastCall = pushMock.mock.calls.at(-1)?.[0] as string
    expect(lastCall).not.toContain("q=")
    expect(lastCall).not.toContain("stage=")
  })

  it("renders the pagination summary and pushes the next page", async () => {
    const user = userEvent.setup()
    renderTable({ totalCount: 100, page: 1, pageSize: 25 })
    expect(screen.getByText(/1–25 of 100 opportunities/)).toBeTruthy()
    expect(screen.getByText("Page 1 of 4")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: /next page/i }))
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("page=2"))
  })
})
