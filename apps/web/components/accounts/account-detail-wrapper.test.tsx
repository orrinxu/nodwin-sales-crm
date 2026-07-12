/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
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
  TAX_CF_KEYS: [] as string[],
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

// The detail body is organised into facet tabs; inactive panels are unmounted.
const openTab = (name: string | RegExp) => fireEvent.click(screen.getByRole("tab", { name }))

describe("AccountDetailWrapper", () => {
  describe("header + rail (always visible)", () => {
    it("renders the account name heading", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByRole("heading", { name: "Test Corp" })).toBeInTheDocument()
    })

    it("renders the industry as the header subtitle", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText("Technology").length).toBeGreaterThanOrEqual(1)
    })

    it("renders the owner in the stat strip", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText("Charlie Owner").length).toBeGreaterThanOrEqual(1)
    })

    it("renders 'Unassigned' when ownerName is null", () => {
      render(<AccountDetailWrapper {...defaultProps} ownerName={null} />)
      expect(screen.getByText("Unassigned")).toBeInTheDocument()
    })

    it("renders the edit button + form", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Edit")).toBeInTheDocument()
      expect(screen.getByTestId("account-form")).toBeInTheDocument()
    })

    it("shows quick-facts + a brand-guidelines slot in the rail", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Quick facts")).toBeInTheDocument()
      expect(screen.getByText("Brand Guidelines")).toBeInTheDocument()
      // legal name + website appear in the rail (and overview) — at least once.
      expect(screen.getAllByText("Test Corporation LLC").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("testcorp.com").length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("facet tabs", () => {
    it("renders a tab for each area", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      for (const name of ["Overview", "Details", "Contacts", "Opportunities", "Files", "Activity"]) {
        expect(screen.getByRole("tab", { name })).toBeInTheDocument()
      }
    })
  })

  describe("overview tab (default)", () => {
    it("shows key-details and recent-activity peeks", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Key details")).toBeInTheDocument()
      expect(screen.getByText("View all details")).toBeInTheDocument()
      expect(screen.getByText("Recent activity")).toBeInTheDocument()
    })

    it("surfaces country and industry", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getAllByText("US").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Technology").length).toBeGreaterThanOrEqual(1)
    })

    it("'View all details' jumps to the Details tab", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      fireEvent.click(screen.getByText("View all details"))
      expect(screen.getByText("Account details")).toBeInTheDocument()
    })

    it("renders the relationship tree on overview when there are relationships", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      expect(screen.getByText("Relationship Tree")).toBeInTheDocument()
      expect(screen.getByText("Subsidiary of")).toBeInTheDocument()
      expect(screen.getByText("Parent Inc")).toBeInTheDocument()
      expect(screen.getByText(/Acquired in 2024/)).toBeInTheDocument()
    })

    it("does not render the tree when there are no relationships", () => {
      render(<AccountDetailWrapper {...defaultProps} relationshipGraph={emptyRelationshipGraph} />)
      expect(screen.queryByText("Relationship Tree")).not.toBeInTheDocument()
    })
  })

  describe("details tab", () => {
    it("shows account details, description and custom fields", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      openTab("Details")
      expect(screen.getByText("Account details")).toBeInTheDocument()
      expect(screen.getByText("A leading tech company")).toBeInTheDocument()
      expect(screen.getByTestId("custom-fields-display")).toBeInTheDocument()
      expect(screen.getAllByText("Charlie Owner").length).toBeGreaterThanOrEqual(1)
    })

    it("omits the description card when description is null", () => {
      render(<AccountDetailWrapper {...defaultProps} account={makeAccount({ description: null })} />)
      openTab("Details")
      expect(screen.queryByText("Description")).not.toBeInTheDocument()
    })

    it("shows a dash for a missing legal name", () => {
      render(<AccountDetailWrapper {...defaultProps} account={makeAccount({ legalName: null })} />)
      openTab("Details")
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("contacts tab", () => {
    it("lists contacts with titles, links and the Primary badge", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      openTab("Contacts")
      expect(screen.getByText("Contacts (2)")).toBeInTheDocument()
      expect(screen.getByText("Alice Smith")).toBeInTheDocument()
      expect(screen.getByText("Bob Jones")).toBeInTheDocument()
      expect(screen.getByText("CEO")).toBeInTheDocument()
      expect(screen.getByText("Primary")).toBeInTheDocument()
      expect(screen.getByText("alice@testcorp.com").closest("a")).toHaveAttribute("href", "mailto:alice@testcorp.com")
    })

    it("hides attach/detach for non-admins", () => {
      render(<AccountDetailWrapper {...defaultProps} canManageContacts={false} />)
      openTab("Contacts")
      expect(screen.queryByRole("button", { name: "Attach" })).not.toBeInTheDocument()
      expect(screen.queryByLabelText("Detach Bob Jones")).not.toBeInTheDocument()
    })

    it("shows Attach + a detach control for linked (not primary) contacts when admin", () => {
      render(<AccountDetailWrapper {...defaultProps} canManageContacts={true} />)
      openTab("Contacts")
      expect(screen.getByRole("button", { name: "Attach" })).toBeInTheDocument()
      expect(screen.getByLabelText("Detach Bob Jones")).toBeInTheDocument()
      expect(screen.queryByLabelText("Detach Alice Smith")).not.toBeInTheDocument()
    })

    it("shows the empty state when there are no contacts", () => {
      render(<AccountDetailWrapper {...defaultProps} contacts={[]} canManageContacts={true} />)
      openTab("Contacts")
      expect(screen.getByText("Contacts (0)")).toBeInTheDocument()
      expect(screen.getByText(/No contacts attached yet/)).toBeInTheDocument()
    })
  })

  describe("opportunities tab", () => {
    it("lists opportunities with stage, probability, amount and close date", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      openTab("Opportunities")
      expect(screen.getByText("Opportunities (1)")).toBeInTheDocument()
      expect(screen.getByText("Enterprise Deal")).toBeInTheDocument()
      expect(screen.getByText("Propose")).toBeInTheDocument()
      expect(screen.getByText("60%")).toBeInTheDocument()
      expect(screen.getByText("$100,000.00")).toBeInTheDocument()
      expect(screen.getByText("Dec 15, 2026")).toBeInTheDocument()
    })

    it("shows an empty state when there are no opportunities", () => {
      render(<AccountDetailWrapper {...defaultProps} opportunities={[]} />)
      openTab("Opportunities")
      expect(screen.getByText(/No opportunities for this account yet/)).toBeInTheDocument()
    })
  })

  describe("files tab", () => {
    it("shows the Files module + pinned RFP/Proposal/Contract slots", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      openTab("Files")
      expect(screen.getByText("Files (1)")).toBeInTheDocument()
      expect(screen.getAllByText("Contract.pdf").length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText("RFP")).toBeInTheDocument()
      expect(screen.getByText("Proposal")).toBeInTheDocument()
      expect(screen.getByText("Contract (1)")).toBeInTheDocument()
    })

    it("still shows the module (upload surface) when there are no files", () => {
      render(<AccountDetailWrapper {...defaultProps} documents={[]} />)
      openTab("Files")
      expect(screen.getByText("Files (0)")).toBeInTheDocument()
    })
  })

  describe("activity tab", () => {
    it("renders the Notes composer heading", () => {
      render(<AccountDetailWrapper {...defaultProps} />)
      openTab("Activity")
      expect(screen.getByText("Notes")).toBeInTheDocument()
    })
  })
})
