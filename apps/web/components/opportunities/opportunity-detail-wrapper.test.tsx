/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { OpportunityDetailWrapper } from "./opportunity-detail-wrapper"
import type { OpportunityRecord, BusinessUnitOption } from "@/lib/data/opportunities.types"
import type { DocumentSummary } from "@/lib/data/documents.types"
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

// The record body is organised into facet tabs; inactive panels are unmounted.
// Helpers to move to a panel before asserting its content.
function openTab(name: string | RegExp) {
  fireEvent.click(screen.getByRole("tab", { name }))
}

function makeOpportunity(overrides: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: "opp-1",
    name: "Big Deal",
    accountId: "acct-1",
    accountName: "Acme Corp",
    primaryContactId: null,
    primaryContactName: null,
    billingEntityName: null,
    entitySalesName: null,
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
  documents: [],
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

  describe("facet tabs", () => {
    it("renders the record facet tabs", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      for (const name of ["Overview", "Details", "Files", "Activity", "Team & Splits", "Cash Plan"]) {
        expect(screen.getByRole("tab", { name })).toBeInTheDocument()
      }
    })

    it("locks the Cash Plan tab until Verbal Agreement", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      openTab("Cash Plan")
      expect(screen.getByText("Cash Plan unlocks at Verbal Agreement")).toBeInTheDocument()
      // Names the current stage so the user knows how far off it is.
      expect(screen.getByText(/currently at Negotiate/)).toBeInTheDocument()
    })

    it("unlocks the Cash Plan tab at/after Verbal Agreement", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ stage: "verbal_agreement" })} />)
      openTab("Cash Plan")
      expect(screen.queryByText("Cash Plan unlocks at Verbal Agreement")).not.toBeInTheDocument()
    })
  })

  describe("overview tab (default)", () => {
    it("shows the pinned document band", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("RFP")).toBeInTheDocument()
      expect(screen.getByText("Proposal")).toBeInTheDocument()
      expect(screen.getByText("Contract")).toBeInTheDocument()
      expect(screen.getAllByText("None yet")).toHaveLength(3)
    })

    it("surfaces key details with jump-to-tab links", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Key details")).toBeInTheDocument()
      expect(screen.getByText("View all details")).toBeInTheDocument()
      expect(screen.getByText("Recent activity")).toBeInTheDocument()
      expect(screen.getByText("Open Activity")).toBeInTheDocument()
    })

    it("'View all details' jumps to the Details tab", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      fireEvent.click(screen.getByText("View all details"))
      expect(screen.getByText("Deal details")).toBeInTheDocument()
    })
  })

  describe("documents band (pinned slots)", () => {
    it("fills a pinned slot with the most-recent doc + display-only tier badge", () => {
      const documents: DocumentSummary[] = [
        { id: "d1", name: "Old RFP.pdf", category: "rfp", mimeType: "application/pdf", sizeBytes: 1000, hasFile: true, driveFileId: null, driveLinkUrl: null, uploadedBy: "u1", uploadedAt: "2026-01-01T00:00:00Z", indexStatus: null },
        { id: "d2", name: "New RFP.pdf", category: "rfp", mimeType: "application/pdf", sizeBytes: 2000, hasFile: true, driveFileId: null, driveLinkUrl: null, uploadedBy: "u1", uploadedAt: "2026-05-01T00:00:00Z", indexStatus: null },
      ]
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          documents={documents}
          opportunity={makeOpportunity({ visibilityTier: "confidential" })}
        />,
      )
      // Most-recent doc surfaces in the pinned slot on the overview tab.
      expect(screen.getAllByText("New RFP.pdf").length).toBeGreaterThanOrEqual(1)
      // The other two pinned slots stay empty.
      expect(screen.getAllByText("None yet")).toHaveLength(2)
      // Tier badge is the deal's tier, shown for display only.
      expect(screen.getByText("Confidential")).toBeInTheDocument()
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

  describe("details tab", () => {
    it("renders the focused card headings", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      openTab("Details")
      expect(screen.getByText("Deal details")).toBeInTheDocument()
      expect(screen.getByText("Commercials")).toBeInTheDocument()
      expect(screen.getByText("Classification")).toBeInTheDocument()
      expect(screen.getByText("Description")).toBeInTheDocument()
      expect(screen.getByText("System information")).toBeInTheDocument()
    })

    it("does NOT re-render deduped facts in the detail cards", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      openTab("Details")
      expect(screen.queryByText("Probability (%)")).not.toBeInTheDocument()
      expect(screen.queryByText("Opportunity Owner")).not.toBeInTheDocument()
      expect(screen.queryByText("Account Name")).not.toBeInTheDocument()
      expect(screen.queryByText("Service Period Start")).not.toBeInTheDocument()
    })
  })

  describe("close date", () => {
    it("displays the close date in the overview key details", () => {
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
      openTab("Details")
      expect(screen.getByText("A promising opportunity")).toBeInTheDocument()
    })

    it("offers an 'Add a description' affordance when null", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ description: null })} />)
      openTab("Details")
      expect(screen.getByText("Add a description")).toBeInTheDocument()
    })
  })

  describe("classification fields", () => {
    it("displays serviceType labels when set", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ serviceType: ["brand_campaign_and_activation", "pr"] })} />)
      openTab("Details")
      expect(screen.getByText("Brand Campaign & Activation, PR")).toBeInTheDocument()
    })

    it("offers an 'Add' affordance when serviceType is null", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      openTab("Details")
      expect(screen.getAllByText("Add").length).toBeGreaterThanOrEqual(1)
    })

    it("displays propertyType label when set", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ propertyType: "conference" })} />)
      openTab("Details")
      expect(screen.getByText("Conference")).toBeInTheDocument()
    })

    it("renders the resolved billing-entity name, never a raw id", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ billingEntityId: "ent-1", billingEntityName: "Nodwin Gaming Pvt Ltd" })}
        />,
      )
      openTab("Details")
      expect(screen.getByText("Nodwin Gaming Pvt Ltd")).toBeInTheDocument()
      expect(screen.queryByText(/Entity ·/)).not.toBeInTheDocument()
      expect(screen.queryByText(/ent-1/)).not.toBeInTheDocument()
    })

    it("renders the resolved primary-contact name, never a raw id", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ primaryContactId: "c-1", primaryContactName: "Priya Sharma" })}
        />,
      )
      openTab("Details")
      expect(screen.getByText("Priya Sharma")).toBeInTheDocument()
      expect(screen.queryByText(/c-1/)).not.toBeInTheDocument()
    })
  })

  describe("commercials", () => {
    it("labels barter value", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ barterValue: "10000.00" })} />)
      openTab("Details")
      expect(screen.getByText("Barter value")).toBeInTheDocument()
    })

    it("displays country execution with labels", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ countryExecution: "IN, US" })} />)
      openTab("Details")
      expect(screen.getByText("India, United States")).toBeInTheDocument()
    })
  })

  describe("loss reason", () => {
    it("displays loss reason when set", () => {
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ stage: "closed_lost", lossReason: "Budget cut" })} />)
      openTab("Details")
      expect(screen.getByText("Budget cut")).toBeInTheDocument()
    })
  })

  describe("activity tab", () => {
    it("renders the composer and timeline sub-segments", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      openTab("Activity")
      expect(screen.getByTestId("activity-composer")).toBeInTheDocument()
      for (const seg of ["All", "Notes", "Calls", "Email", "Stage history"]) {
        expect(screen.getByRole("button", { name: seg })).toBeInTheDocument()
      }
    })

    it("shows stage history under its sub-segment", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      openTab("Activity")
      fireEvent.click(screen.getByRole("button", { name: "Stage history" }))
      expect(screen.getByText("No stage changes recorded yet.")).toBeInTheDocument()
    })
  })

  describe("team & splits tab", () => {
    it("renders the team and splits editors", () => {
      render(<OpportunityDetailWrapper {...defaultProps} updateTeamAction={vi.fn()} updateSplitsAction={vi.fn()} />)
      openTab("Team & Splits")
      expect(screen.getByText("Opportunity Team")).toBeInTheDocument()
      expect(screen.getByText("Opportunity Splits")).toBeInTheDocument()
    })
  })

  describe("persistent rail", () => {
    it("keeps the Approval card in the rail regardless of active tab", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Approval")).toBeInTheDocument()
      // Still present after switching tabs.
      openTab("Details")
      expect(screen.getByText("Approval")).toBeInTheDocument()
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

    it("an empty-field 'Add' affordance fires the shared Edit trigger", () => {
      // Guards our ref wiring: openEdit → editTriggerRef.current.click() must
      // reach the Edit control (base-ui then toggles the sheet open).
      render(<OpportunityDetailWrapper {...defaultProps} opportunity={makeOpportunity({ primaryContactId: null })} />)
      const editButton = screen.getByText("Edit").closest("button")
      expect(editButton).not.toBeNull()
      const clickSpy = vi.fn()
      editButton!.addEventListener("click", clickSpy)
      fireEvent.click(screen.getAllByText("Add")[0])
      expect(clickSpy).toHaveBeenCalledTimes(1)
    })
  })
})
