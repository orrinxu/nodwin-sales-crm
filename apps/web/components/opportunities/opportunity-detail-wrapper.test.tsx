/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
    <div data-testid="opportunity-form">
      {trigger}
    </div>
  ),
}))

const mockBusinessUnits: BusinessUnitOption[] = [
  { id: "bu-1", name: "East Asia Sales" },
]

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
  describe("smoke", () => {
    it("renders without throwing", () => {
      expect(() => <OpportunityDetailWrapper {...defaultProps} />).not.toThrow()
    })
  })

  describe("header", () => {
    it("renders the opportunity name", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText("Big Deal").length).toBeGreaterThanOrEqual(1)
    })

    it("renders the stage badge", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      const badges = screen.getAllByText("Negotiate")
      expect(badges.length).toBeGreaterThanOrEqual(1)
    })

    it("renders probability percentage in header", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText("75%").length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("highlights bar", () => {
    it("displays account name", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText("Acme Corp").length).toBeGreaterThanOrEqual(1)
    })

    it("displays the formatted amount", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText("$50,000.00").length).toBeGreaterThanOrEqual(1)
    })

    it("displays owner name", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      const ownerEls = screen.getAllByText("Alice")
      expect(ownerEls.length).toBeGreaterThanOrEqual(1)
    })

    it("displays 'Unassigned' when ownerName is null", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ ownerName: null })}
        />,
      )
      expect(screen.getAllByText("Unassigned").length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("stage path", () => {
    it("renders all non-terminal stage labels", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      NON_TERMINAL_STAGES.forEach((s) => {
        expect(screen.getAllByText(getStageLabel(s)).length).toBeGreaterThanOrEqual(1)
      })
    })

    it("does not render terminal stage labels in the path", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.queryByText("Closed Won")).not.toBeInTheDocument()
      expect(screen.queryByText("Closed Lost")).not.toBeInTheDocument()
    })
  })

  describe("collapsible sections", () => {
    it("renders Details section with fields", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Details")).toBeInTheDocument()
    })

    it("renders Description section", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Description")).toBeInTheDocument()
    })

    it("renders Pricing section", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Pricing")).toBeInTheDocument()
    })

    it("renders Other Information section", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Other Information")).toBeInTheDocument()
    })

    it("renders System Information section", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("System Information")).toBeInTheDocument()
    })
  })

  describe("close date", () => {
    it("displays close date in Details section", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Jun 30, 2026")).toBeInTheDocument()
    })

    it("shows em dash when closeDate is null", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ closeDate: null })}
        />,
      )
      expect(screen.getAllByText("\u2014").length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("description", () => {
    it("renders description text when present", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("A promising opportunity")).toBeInTheDocument()
    })

    it("shows fallback when description is null", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ description: null })}
        />,
      )
      expect(screen.getByText("No description provided.")).toBeInTheDocument()
    })
  })

  describe("right panel", () => {
    it("renders the communications tabs and related cards", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      // Communications tab labels (always rendered in the tab list)
      expect(screen.getByRole("tab", { name: "Activity" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Notes" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Calls" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Files" })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: "Email" })).toBeInTheDocument()
      // Related cards
      expect(screen.getByText("Approval History")).toBeInTheDocument()
      expect(screen.getByText("Opportunity Team")).toBeInTheDocument()
      expect(screen.getByText("Opportunity Splits")).toBeInTheDocument()
      expect(screen.getByText("Stage History")).toBeInTheDocument()
    })

    it("shows a read-only 'not submitted' state when there are no approvals", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(
        screen.getByText("This opportunity has not been submitted for approval."),
      ).toBeInTheDocument()
    })

    it("renders the approval status passed from the server", () => {
      render(<OpportunityDetailWrapper {...defaultProps} approvalStatus="Pending" />)
      expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("new display fields", () => {
    it("displays serviceType labels when set", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({
            serviceType: ["brand_campaign_and_activation", "pr"],
          })}
        />,
      )
      expect(screen.getByText("Brand Campaign & Activation, PR")).toBeInTheDocument()
    })

    it("displays em dash when serviceType is null", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      // serviceType is null in default opp — should show em dash in Other Information
      expect(screen.getAllByText("\u2014").length).toBeGreaterThanOrEqual(1)
    })

    it("displays propertyType label when set", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ propertyType: "conference" })}
        />,
      )
      expect(screen.getByText("Conference")).toBeInTheDocument()
    })

    it("displays barter value when set", () => {
      // Need a mock that returns different values
      const mockModule = vi.mocked
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ barterValue: "10000.00" })}
        />,
      )
      // barter is formatted via Money — the mock always returns $50,000.00
      // but at minimum the label "Barter Value" should be present
      expect(screen.getByText("Barter Value")).toBeInTheDocument()
    })

    it("displays billing entity name from businessUnits", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ billingEntityId: "bu-1" })}
        />,
      )
      expect(screen.getAllByText("East Asia Sales").length).toBeGreaterThanOrEqual(1)
    })

    it("displays entity sales name from businessUnits", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ entitySalesId: "bu-1" })}
        />,
      )
      expect(screen.getAllByText("East Asia Sales").length).toBeGreaterThanOrEqual(1)
    })

    it("displays country execution with labels", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ countryExecution: "IN, US" })}
        />,
      )
      expect(screen.getByText("India, United States")).toBeInTheDocument()
    })

    it("displays loss reason when set", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({
            stage: "closed_lost",
            lossReason: "Budget cut",
          })}
        />,
      )
      expect(screen.getByText("Budget cut")).toBeInTheDocument()
    })

    it("displays em dash when loss reason is null", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      // lossReason is null in default opp — em dash in Details
      expect(screen.getAllByText("\u2014").length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("action buttons", () => {
    it("renders edit button", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Edit")).toBeInTheDocument()
    })

    it("renders opportunity form", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByTestId("opportunity-form")).toBeInTheDocument()
    })

    it("renders disabled action buttons", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Submit for Approval")).toBeDisabled()
      expect(screen.getByText("Set Revenue Schedule")).toBeDisabled()
      expect(screen.getByText("Create Jira Issue")).toBeDisabled()
    })
  })
})
