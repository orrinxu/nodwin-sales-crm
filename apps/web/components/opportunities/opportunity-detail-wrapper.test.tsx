/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { OpportunityDetailWrapper } from "./opportunity-detail-wrapper"
import type { OpportunityRecord, BusinessUnitOption } from "@/lib/data/opportunities.types"
import { NON_TERMINAL_STAGES } from "@/lib/opportunity"
import { getStageLabel } from "@/lib/data/opportunities.types"

vi.mock("server-only", () => ({}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("@/lib/money", () => ({
  Money: {
    fromAmount: () => ({
      toDisplay: () => "$50,000.00",
    }),
  },
}))

vi.mock("@/components/opportunities/activity-timeline", () => ({
  ActivityTimeline: () => <div data-testid="activity-timeline" />,
}))

vi.mock("@/components/opportunities/activity-composer", () => ({
  ActivityComposer: () => <div data-testid="activity-composer" />,
}))

vi.mock("@/components/opportunities/opportunity-form", () => ({
  OpportunityForm: ({ trigger }: { trigger?: React.ReactNode }) => (
    <div data-testid="opportunity-form">{trigger}</div>
  ),
}))

const mockBusinessUnits: BusinessUnitOption[] = [{ id: "bu-1", name: "East Asia Sales" }]

function makeOpportunity(overrides: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: "opp-1",
    name: "Big Deal",
    accountId: "acct-1",
    accountName: "Acme Corp",
    primaryContactId: null,
    stage: "negotiate",
    probabilityPct: 75,
    amount: "50000.00",
    currency: "USD",
    ownerUserId: "user-1",
    ownerName: "Alice",
    salesUnitId: "bu-1",
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
    description: "A promising opportunity",
    closeDate: "2026-06-30",
    lossReason: null,
    visibilityTier: "standard",
    customData: {},
    createdAt: "2026-01-15T08:00:00Z",
    updatedAt: "2026-04-01T10:00:00Z",
    ...overrides,
  }
}

const defaultProps = {
  opportunity: makeOpportunity(),
  businessUnits: mockBusinessUnits,
  updateAction: vi.fn(),
  updateStageAction: vi.fn(),
  activities: [],
  createActivityAction: vi.fn(),
}

describe("OpportunityDetailWrapper", () => {
  describe("header", () => {
    it("renders the opportunity name once (h1)", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText("Big Deal")).toHaveLength(1)
    })

    it("renders probability in the header", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText(/75%/)).toBeInTheDocument()
    })
  })

  describe("stat strip", () => {
    it("shows account, owner and amount", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
      expect(screen.getByText("Alice")).toBeInTheDocument()
      expect(screen.getByText("$50,000.00")).toBeInTheDocument()
    })

    it("shows 'Unassigned' when ownerName is null", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ ownerName: null })} />)
      expect(screen.getByText("Unassigned")).toBeInTheDocument()
    })

    it("renders the approval status from the server", () => {
      render(<OpportunityDetailWrapper {...defaultProps} approvalStatus="Pending" />)
      expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("no fact renders twice (dedup)", () => {
    it("amount appears exactly once", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText("$50,000.00")).toHaveLength(1)
    })
    it("owner appears exactly once", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText("Alice")).toHaveLength(1)
    })
    it("current stage label appears exactly once (tracker only)", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText("Negotiate")).toHaveLength(1)
    })
  })

  describe("stage tracker", () => {
    it("renders all non-terminal stage labels", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      NON_TERMINAL_STAGES.forEach((s) => {
        expect(screen.getAllByText(getStageLabel(s)).length).toBeGreaterThanOrEqual(1)
      })
    })

    it("shows a generic 'Closed' node while open (not the terminal labels)", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Closed")).toBeInTheDocument()
      expect(screen.queryByText("Closed Won")).not.toBeInTheDocument()
      expect(screen.queryByText("Closed Lost")).not.toBeInTheDocument()
    })
  })

  describe("detail cards", () => {
    it("renders the focused card headings", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Deal details")).toBeInTheDocument()
      expect(screen.getByText("Commercials")).toBeInTheDocument()
      expect(screen.getByText("Classification")).toBeInTheDocument()
      expect(screen.getByText("Description")).toBeInTheDocument()
      expect(screen.getByText("System information")).toBeInTheDocument()
    })

    it("does NOT re-render deduped facts in the detail cards", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      // Old duplicate labels are gone from the lower sections.
      expect(screen.queryByText("Probability (%)")).not.toBeInTheDocument()
      expect(screen.queryByText("Opportunity Owner")).not.toBeInTheDocument()
      expect(screen.queryByText("Account Name")).not.toBeInTheDocument()
      expect(screen.queryByText("Service Period Start")).not.toBeInTheDocument()
    })
  })

  describe("close date", () => {
    it("displays the close date", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Jun 30, 2026")).toBeInTheDocument()
    })

    it("offers an 'Add' affordance when closeDate is null", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ closeDate: null })} />)
      expect(screen.getAllByText("Add").length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("description", () => {
    it("renders description text when present", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("A promising opportunity")).toBeInTheDocument()
    })

    it("offers an 'Add a description' affordance when null", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ description: null })} />)
      expect(screen.getByText("Add a description")).toBeInTheDocument()
    })
  })

  describe("classification fields", () => {
    it("displays serviceType labels when set", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ serviceType: ["brand_campaign_and_activation", "pr"] })} />)
      expect(screen.getByText("Brand Campaign & Activation, PR")).toBeInTheDocument()
    })

    it("offers an 'Add' affordance when serviceType is null", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText("Add").length).toBeGreaterThanOrEqual(1)
    })

    it("displays propertyType label when set", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ propertyType: "conference" })} />)
      expect(screen.getByText("Conference")).toBeInTheDocument()
    })

    it("renders a muted entity id-hint (name resolution is a separate ticket), not a business-unit name", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ billingEntityId: "bu-1" })} />)
      expect(screen.getByText(/Entity ·/)).toBeInTheDocument()
      // The old bug resolved billing_entity_id against business_units — must not happen now.
      expect(screen.queryByText("East Asia Sales")).not.toBeInTheDocument()
    })
  })

  describe("commercials", () => {
    it("labels barter value", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ barterValue: "10000.00" })} />)
      expect(screen.getByText("Barter value")).toBeInTheDocument()
    })

    it("displays country execution with labels", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ countryExecution: "IN, US" })} />)
      expect(screen.getByText("India, United States")).toBeInTheDocument()
    })
  })

  describe("loss reason", () => {
    it("displays loss reason when set", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ stage: "closed_lost", lossReason: "Budget cut" })} />)
      expect(screen.getByText("Budget cut")).toBeInTheDocument()
    })
  })

  describe("right rail", () => {
    it("renders all five communication tabs (fully labeled, no truncation)", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByRole("tab", { name: "Activity" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Notes" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Calls" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Files" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Email" })).toBeInTheDocument()
    })

    it("keeps Approval, Team, Splits and Stage History as right-rail cards", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Approval")).toBeInTheDocument()
      expect(screen.getByText("Opportunity Team")).toBeInTheDocument()
      expect(screen.getByText("Opportunity Splits")).toBeInTheDocument()
      expect(screen.getByText("Stage History")).toBeInTheDocument()
    })

    it("shows the read-only 'not submitted' approval state", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("This opportunity has not been submitted for approval.")).toBeInTheDocument()
    })
  })

  describe("action buttons", () => {
    it("renders the edit button and form", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Edit")).toBeInTheDocument()
      expect(screen.getByTestId("opportunity-form")).toBeInTheDocument()
    })

    it("renders disabled action buttons", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Submit for Approval")).toBeDisabled()
      expect(screen.getByText("Set Revenue Schedule")).toBeDisabled()
    })

    it("enables Submit for Approval when the user may submit", () => {
      render(<OpportunityDetailWrapper {...defaultProps} canSubmitApproval submitApprovalAction={vi.fn()} />)
      expect(screen.getByText("Submit for Approval")).not.toBeDisabled()
    })

    it("shows the approve/reject box for the actionable approver", () => {
      render(<OpportunityDetailWrapper {...defaultProps} actionableStepId="step-1" recordDecisionAction={vi.fn()} />)
      expect(screen.getByText("This approval is waiting on you.")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument()
    })
  })
})
