/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { OpportunityDetailWrapper } from "./opportunity-detail-wrapper"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"
import type { BusinessUnitOption } from "@/lib/data/opportunities.types"

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

vi.mock("@/components/opportunities/document-list", () => ({
  DocumentList: () => <div data-testid="document-list" />,
}))

vi.mock("@/components/opportunities/document-upload-dialog", () => ({
  DocumentUploadDialog: () => <div data-testid="document-upload-dialog" />,
}))

vi.mock("@/components/opportunities/opportunity-form", () => ({
  OpportunityForm: ({ trigger }: { trigger?: React.ReactNode }) => (
    <div data-testid="opportunity-form">
      {trigger}
    </div>
  ),
}))

vi.mock("@/components/ui/tabs", () => {
  function Tabs({ children, defaultValue }: { children: React.ReactNode; defaultValue?: string }) {
    return <div data-testid="tabs" data-default-value={defaultValue}>{children}</div>
  }
  function TabsList({ children }: { children: React.ReactNode }) {
    return <div data-testid="tabs-list">{children}</div>
  }
  function TabsTab({ children, value }: { children: React.ReactNode; value: string }) {
    return <button data-testid="tabs-tab" data-value={value} type="button">{children}</button>
  }
  function TabsPanel({ children, value }: { children: React.ReactNode; value: string }) {
    return <div data-testid="tabs-panel" data-value={value}>{children}</div>
  }
  return { Tabs, TabsList, TabsTab, TabsPanel }
})

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
    description: "A promising opportunity",
    closeDate: "2026-06-30",
    lossReason: null,
    customData: {},
    createdAt: "2026-01-15T08:00:00Z",
    updatedAt: "2026-04-01T10:00:00Z",
    ...overrides,
  }
}

const defaultProps = {
  opportunity: makeOpportunity(),
  businessUnits: mockBusinessUnits,
  documents: [],
  updateAction: vi.fn(),
  createDocumentAction: vi.fn(),
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
      expect(screen.getByText("Big Deal")).toBeInTheDocument()
    })

    it("renders the stage badge", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      const badges = screen.getAllByText("Negotiate")
      expect(badges.length).toBeGreaterThanOrEqual(1)
    })

    it("renders the owner name", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      const ownerEls = screen.getAllByText("Alice")
      expect(ownerEls.length).toBeGreaterThanOrEqual(1)
    })

    it("renders 'Unassigned' when ownerName is null", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ ownerName: null })}
        />,
      )
      expect(screen.getByText("Unassigned")).toBeInTheDocument()
    })
  })

  describe("stage progress indicator", () => {
    it("renders all 7 stage dots", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      const dots = document.querySelectorAll(".rounded-full")
      expect(dots).toHaveLength(7)
    })

    it("renders the first and last stage labels", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Qualify")).toBeInTheDocument()
      expect(screen.getByText("Closed Lost")).toBeInTheDocument()
    })
  })

  describe("Overview card", () => {
    it("displays the formatted amount", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("$50,000.00")).toBeInTheDocument()
    })

    it("displays probability percentage", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("75%")).toBeInTheDocument()
    })

    it("displays currency", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("USD")).toBeInTheDocument()
    })

    it("displays close date", () => {
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
      expect(screen.getByText("\u2014")).toBeInTheDocument()
    })
  })

  describe("Details card", () => {
    it("displays account name", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
    })

    it("shows em dash when accountName is null", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ accountName: null })}
        />,
      )
      expect(screen.getByText("\u2014")).toBeInTheDocument()
    })

    it("displays sales unit name resolved from businessUnits", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("East Asia Sales")).toBeInTheDocument()
    })

    it("shows em dash when sales unit not found", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ salesUnitId: "nonexistent", accountName: null })}
        />,
      )
      const dashes = screen.getAllByText("\u2014")
      expect(dashes.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("description card", () => {
    it("renders description when present", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("A promising opportunity")).toBeInTheDocument()
    })

    it("does not render description card when description is null", () => {
      render(
        <OpportunityDetailWrapper
          {...defaultProps}
          opportunity={makeOpportunity({ description: null })}
        />,
      )
      expect(screen.queryByText("Description")).not.toBeInTheDocument()
    })
  })

  describe("tabs", () => {
    it("renders all 7 tabs", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getAllByTestId("tabs-tab")).toHaveLength(7)
    })

    it("renders document components in documents tab", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByTestId("document-list")).toBeInTheDocument()
      expect(screen.getByTestId("document-upload-dialog")).toBeInTheDocument()
    })

    it("sets notes as default tab", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      const tabs = screen.getByTestId("tabs")
      expect(tabs).toHaveAttribute("data-default-value", "notes")
    })
  })

  describe("edit button", () => {
    it("renders edit button", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Edit")).toBeInTheDocument()
    })

    it("renders opportunity form", () => {
      render(<OpportunityDetailWrapper {...defaultProps} />)
      expect(screen.getByTestId("opportunity-form")).toBeInTheDocument()
    })
  })
})
