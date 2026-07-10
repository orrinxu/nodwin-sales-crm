/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { AccountDetailWrapper } from "./account-detail-wrapper"
import type { AccountRecord, AccountRelationshipGraph, AccountOpportunity } from "@/lib/data/accounts"
import type { DocumentSummary } from "@/lib/data/documents"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"

vi.mock("server-only", () => ({}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("@/components/accounts/account-form", () => ({
  AccountForm: ({ trigger }: { trigger?: React.ReactNode }) => (
    <div data-testid="account-form">{trigger}</div>
  ),
}))

vi.mock("@/components/contacts/custom-fields-display", () => ({
  CustomFieldsDisplay: () => <div data-testid="custom-fields-display" />,
}))

vi.mock("@/lib/data/opportunities.types", () => ({
  getStageLabel: (stage: string) => stage.charAt(0).toUpperCase() + stage.slice(1),
}))

vi.mock("@/lib/money", () => ({
  Money: {
    fromAmount: (amount: string) => ({
      toDisplay: () =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(Number(amount)), // eslint-disable-line custom/no-unsafe-numeric-coercion -- test mock, not production money code
    }),
  },
}))

function makeAccount(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: "acct-1",
    name: "Test Corp",
    legalName: "Test Corporation LLC",
    website: "https://testcorp.com",
    country: "US",
    industry: "Technology",
    description: "A leading tech company",
    accountOwnerUserId: "user-1",
    emailDomains: ["testcorp.com"],
    customData: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    createdBy: "user-1",
    updatedBy: "user-1",
    deletedAt: null,
    ...overrides,
  }
}

const emptyFieldDefinitions: FieldDefinition[] = []

const defaultRelationshipGraph: AccountRelationshipGraph = {
  root: {
    id: "acct-1",
    accountId: "acct-1",
    accountName: "Test Corp",
    kind: null,
    direction: null,
    notes: null,
    children: [
      {
        id: "rel-1",
        accountId: "acct-2",
        accountName: "Parent Inc",
        kind: "subsidiary_of",
        direction: "outbound",
        notes: "Acquired in 2024",
        children: [],
      },
    ],
  },
}

const emptyRelationshipGraph: AccountRelationshipGraph = {
  root: {
    id: "acct-1",
    accountId: "acct-1",
    accountName: "Test Corp",
    kind: null,
    direction: null,
    notes: null,
    children: [],
  },
}

const defaultContacts = [
  { id: "c-1", fullName: "Alice Smith", title: "CEO", email: "alice@testcorp.com", relation: "primary" as const },
  { id: "c-2", fullName: "Bob Jones", title: "CTO", email: null, relation: "linked" as const },
]

const defaultOpportunities: AccountOpportunity[] = [
  {
    id: "opp-1",
    name: "Enterprise Deal",
    stage: "propose",
    amount: "100000.00",
    currency: "USD",
    closeDate: "2026-12-15",
    probabilityPct: 60,
  },
]

const defaultDocuments: DocumentSummary[] = [
  {
    id: "doc-1",
    name: "Contract.pdf",
    mimeType: "application/pdf",
    category: "contract",
    sizeBytes: 2048,
    hasFile: true,
    driveFileId: null,
    driveLinkUrl: null,
    uploadedBy: "user-1",
    uploadedAt: "2026-06-01T12:00:00Z",
    indexStatus: null,
  },
]

const mockOwnerOptions = [
  { id: "user-1", name: "Charlie Owner" },
  { id: "user-2", name: "Alice Admin" },
]

const mockAccountOptions = [
  { id: "acct-1", name: "Test Corp" },
  { id: "acct-2", name: "Parent Inc" },
]

const defaultProps = {
  account: makeAccount(),
  fieldDefinitions: emptyFieldDefinitions,
  taxIdTypes: [],
  taxIds: [],
  relationshipGraph: defaultRelationshipGraph,
  contacts: defaultContacts,
  canManageContacts: false,
  attachableContacts: [],
  attachContactsAction: vi.fn(),
  detachContactAction: vi.fn(),
  createContactAction: vi.fn(),
  opportunities: defaultOpportunities,
  documents: defaultDocuments,
  ownerName: "Charlie Owner",
  ownerOptions: mockOwnerOptions,
  accountOptions: mockAccountOptions,
  activities: [],
  updateAction: vi.fn(),
  saveTaxIdsAction: vi.fn(),
  createActivityAction: vi.fn(),
}

describe("AccountDetailWrapper", () => {
  describe("smoke", () => {
    it("renders without throwing", () => {
      expect(() => <AccountDetailWrapper {...defaultProps} />).not.toThrow()
    })
  })

  describe("header", () => {
    it("renders the account name", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByRole("heading", { name: "Test Corp" })).toBeInTheDocument()
    })

    it("renders the industry badge", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      const badges = screen.getAllByText("Technology")
      expect(badges.length).toBeGreaterThanOrEqual(1)
    })

    it("renders the owner name", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      const ownerEls = screen.getAllByText("Charlie Owner")
      expect(ownerEls.length).toBeGreaterThanOrEqual(1)
    })

    it("renders 'Unassigned' when ownerName is null", () => {
      render(
        <AccountDetailWrapper {...defaultProps} ownerName={null} />,
      )
      expect(screen.getByText("Unassigned")).toBeInTheDocument()
    })

    it("renders edit button", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Edit")).toBeInTheDocument()
    })

    it("renders account form", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByTestId("account-form")).toBeInTheDocument()
    })
  })

  describe("Overview card", () => {
    it("displays legal name", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Test Corporation LLC")).toBeInTheDocument()
    })

    it("displays website", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      const websiteEls = screen.getAllByText("testcorp.com")
      expect(websiteEls.length).toBeGreaterThanOrEqual(1)
    })

    it("displays country", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("US")).toBeInTheDocument()
    })

    it("displays industry", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      const industryItems = screen.getAllByText("Technology")
      expect(industryItems.length).toBeGreaterThanOrEqual(1)
    })

    it("shows em dash for missing legal name", () => {
      render(
        <AccountDetailWrapper
          {...defaultProps}
          account={makeAccount({ legalName: null })}
        />,
      )
      expect(screen.getByText("\u2014")).toBeInTheDocument()
    })

    it("shows em dash for missing website", () => {
      render(
        <AccountDetailWrapper
          {...defaultProps}
          account={makeAccount({ website: null })}
        />,
      )
      expect(screen.getByText("\u2014")).toBeInTheDocument()
    })
  })

  describe("Details card", () => {
    it("displays owner name", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      const ownerEls = screen.getAllByText("Charlie Owner")
      expect(ownerEls.length).toBeGreaterThanOrEqual(1)
    })

    it("displays email domains as badges", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      const domainEls = screen.getAllByText("testcorp.com")
      expect(domainEls.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("description card", () => {
    it("renders description when present", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("A leading tech company")).toBeInTheDocument()
    })

    it("does not render description card when description is null", () => {
      render(
        <AccountDetailWrapper
          {...defaultProps}
          account={makeAccount({ description: null })}
        />,
      )
      expect(screen.queryByText("Description")).not.toBeInTheDocument()
    })
  })

  describe("custom fields", () => {
    it("renders custom fields display", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByTestId("custom-fields-display")).toBeInTheDocument()
    })
  })

  describe("Contacts card", () => {
    it("renders contacts heading with count", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Contacts (2)")).toBeInTheDocument()
    })

    it("renders contact names as links", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Alice Smith")).toBeInTheDocument()
      expect(screen.getByText("Bob Jones")).toBeInTheDocument()
    })

    it("renders contact titles", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("CEO")).toBeInTheDocument()
      expect(screen.getByText("CTO")).toBeInTheDocument()
    })

    it("renders contact email links", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      const emailLink = screen.getByText("alice@testcorp.com")
      expect(emailLink.closest("a")).toHaveAttribute("href", "mailto:alice@testcorp.com")
    })

    it("does not render contacts card when empty", () => {
      render(
        <AccountDetailWrapper {...defaultProps} contacts={[]} />,
      )
      expect(screen.queryByText("Contacts")).not.toBeInTheDocument()
    })

    it("shows the Primary badge for a primary contact", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Primary")).toBeInTheDocument()
    })

    it("hides attach/detach controls for non-admins", () => {
      render(<AccountDetailWrapper {...defaultProps} canManageContacts={false} />)
      expect(screen.queryByRole("button", { name: "Attach" })).not.toBeInTheDocument()
      expect(screen.queryByLabelText("Detach Bob Jones")).not.toBeInTheDocument()
    })

    it("shows Attach and a detach control for linked (not primary) contacts when admin", () => {
      render(<AccountDetailWrapper {...defaultProps} canManageContacts={true} />)
      expect(screen.getByRole("button", { name: "Attach" })).toBeInTheDocument()
      // Bob is linked → detachable; Alice is primary → not detachable here.
      expect(screen.getByLabelText("Detach Bob Jones")).toBeInTheDocument()
      expect(screen.queryByLabelText("Detach Alice Smith")).not.toBeInTheDocument()
    })

    it("shows the empty state with Attach for admins when there are no contacts", () => {
      render(<AccountDetailWrapper {...defaultProps} contacts={[]} canManageContacts={true} />)
      expect(screen.getByText("Contacts (0)")).toBeInTheDocument()
      expect(screen.getByText(/No contacts attached yet/)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Attach" })).toBeInTheDocument()
    })
  })

  describe("Opportunities card", () => {
    it("renders opportunities heading with count", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Opportunities (1)")).toBeInTheDocument()
    })

    it("renders opportunity name as link", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Enterprise Deal")).toBeInTheDocument()
    })

    it("renders stage badge", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Propose")).toBeInTheDocument()
    })

    it("renders probability", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("60%")).toBeInTheDocument()
    })

    it("renders formatted amount", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("$100,000.00")).toBeInTheDocument()
    })

    it("renders close date", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Dec 15, 2026")).toBeInTheDocument()
    })

    it("does not render opportunities card when empty", () => {
      render(
        <AccountDetailWrapper {...defaultProps} opportunities={[]} />,
      )
      expect(screen.queryByText("Opportunities")).not.toBeInTheDocument()
    })
  })

  describe("Files module", () => {
    it("renders the Files heading with count", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Files (1)")).toBeInTheDocument()
    })

    it("renders document name", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      // Appears in both the pinned Contract slot and the full list.
      expect(screen.getAllByText("Contract.pdf").length).toBeGreaterThanOrEqual(1)
    })

    it("promotes a Documents band with pinned RFP/Proposal/Contract slots", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("RFP")).toBeInTheDocument()
      expect(screen.getByText("Proposal")).toBeInTheDocument()
      // The contract slot is filled; RFP/Proposal are empty.
      expect(screen.getAllByText("None yet")).toHaveLength(2)
    })

    it("groups documents by category", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Contract (1)")).toBeInTheDocument()
    })

    it("renders uploaded date", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText(/Jun 1, 2026/).length).toBeGreaterThanOrEqual(1)
    })

    it("still shows the module (upload surface) when there are no files", () => {
      render(<AccountDetailWrapper {...defaultProps} documents={[]} />)
      expect(screen.getByText("Files (0)")).toBeInTheDocument()
    })
  })

  describe("Relationship tree", () => {
    it("renders the relationship tree title", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Relationship Tree")).toBeInTheDocument()
    })

    it("renders relationship kind label", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Subsidiary of")).toBeInTheDocument()
    })

    it("renders related account name", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Parent Inc")).toBeInTheDocument()
    })

    it("renders relationship notes", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText(/Acquired in 2024/)).toBeInTheDocument()
    })

    it("does not render the tree when there are no relationships", () => {
      render(
        <AccountDetailWrapper {...defaultProps} relationshipGraph={emptyRelationshipGraph} />,
      )
      expect(screen.queryByText("Relationship Tree")).not.toBeInTheDocument()
    })
  })

  describe("empty state", () => {
    it("shows empty message when all linked data is empty", () => {
      render(
        <AccountDetailWrapper
          {...defaultProps}
          contacts={[]}
          opportunities={[]}
          documents={[]}
          relationshipGraph={emptyRelationshipGraph}
        />,
      )
      expect(
        screen.getByText("No related contacts, opportunities, documents, or linked accounts yet."),
      ).toBeInTheDocument()
    })
  })
})
