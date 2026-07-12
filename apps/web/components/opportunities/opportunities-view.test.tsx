import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"
import { OpportunitiesView } from "./opportunities-view"

const pushSpy = vi.fn()
vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: pushSpy }),
}))

// Stub the heavy board/table bodies — this test only asserts which one the
// view opens by default, not their internals.
vi.mock("./opportunity-board", () => ({
  OpportunityBoard: () => <div data-testid="board" />,
}))
vi.mock("./opportunity-list-table", () => ({
  OpportunityListTable: () => <div data-testid="table" />,
}))
vi.mock("./opportunity-form", () => ({
  OpportunityForm: () => <button>New opportunity</button>,
}))

const mockOpportunity: OpportunityRecord = {
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
}

const baseProps = {
  opportunities: [mockOpportunity],
  accounts: [],
  businessUnits: [],
  createAction: vi.fn(),
  updateStageAction: vi.fn(),
  bulkDeleteAction: vi.fn(),
  bulkUpdateStageAction: vi.fn(),
}

describe("OpportunitiesView — defaultView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the board when defaultView="board"', () => {
    render(<OpportunitiesView {...baseProps} defaultView="board" />)
    expect(screen.getByTestId("board")).toBeInTheDocument()
    expect(screen.queryByTestId("table")).not.toBeInTheDocument()
  })

  it('opens the table when defaultView="table"', () => {
    render(<OpportunitiesView {...baseProps} defaultView="table" />)
    expect(screen.getByTestId("table")).toBeInTheDocument()
    expect(screen.queryByTestId("board")).not.toBeInTheDocument()
  })

  it("defaults to the board when defaultView is omitted", () => {
    render(<OpportunitiesView {...baseProps} />)
    expect(screen.getByTestId("board")).toBeInTheDocument()
  })

  it("renders the empty state (not the board) when scope has no owned deals", () => {
    render(
      <OpportunitiesView
        {...baseProps}
        opportunities={[]}
        defaultView="board"
        emptyState={{ title: "You don't own any deals yet" }}
      />,
    )
    expect(screen.getByText("You don't own any deals yet")).toBeInTheDocument()
    expect(screen.queryByTestId("board")).not.toBeInTheDocument()
  })
})

describe("OpportunitiesView — scope chips", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not render chips when scope is omitted", () => {
    render(<OpportunitiesView {...baseProps} />)
    expect(screen.queryByText("My Pipeline")).not.toBeInTheDocument()
    expect(screen.queryByText("All Deals")).not.toBeInTheDocument()
  })

  it("renders all three chips and marks the active one when scope is set", () => {
    render(<OpportunitiesView {...baseProps} scope="all-deals" defaultView="table" />)
    expect(screen.getByText("My Pipeline")).toBeInTheDocument()
    expect(screen.getByText("All Deals")).toBeInTheDocument()
    expect(screen.getByText("Closing This Month")).toBeInTheDocument()
    expect(screen.getByText("All Deals")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("My Pipeline")).toHaveAttribute("aria-pressed", "false")
  })

  it("navigates to the chosen scope while preserving the current view", () => {
    render(<OpportunitiesView {...baseProps} scope="all-deals" defaultView="table" />)
    fireEvent.click(screen.getByText("My Pipeline"))
    expect(pushSpy).toHaveBeenCalledWith(
      "/opportunities?scope=my-pipeline&view=table",
    )
  })

  it("does not navigate when clicking the already-active scope", () => {
    render(<OpportunitiesView {...baseProps} scope="all-deals" defaultView="table" />)
    fireEvent.click(screen.getByText("All Deals"))
    expect(pushSpy).not.toHaveBeenCalled()
  })
})
