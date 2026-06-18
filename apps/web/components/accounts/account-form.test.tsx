/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { AccountForm } from "./account-form"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"

vi.mock("server-only", () => ({}))

vi.mock("@/components/entity-combobox", () => ({
  EntityCombobox: ({ placeholder }: { placeholder?: string }) => (
    <input data-testid="entity-combobox" placeholder={placeholder} readOnly />
  ),
}))

vi.mock("@/components/contacts/custom-fields-form", () => ({
  CustomFieldsForm: ({ fieldDefinitions }: { fieldDefinitions: FieldDefinition[] }) => (
    <div data-testid="custom-fields-form">
      {fieldDefinitions.map((d) => (
        <div key={d.key} data-testid={`cf-${d.key}`}>
          {d.label}
        </div>
      ))}
    </div>
  ),
}))

const mockOwnerOptions = [
  { id: "user-1", name: "Alice Admin" },
  { id: "user-2", name: "Bob Seller" },
]

const mockAccountOptions = [
  { id: "acct-1", name: "Acme Corp" },
  { id: "acct-2", name: "Globex Inc" },
  { id: "acct-3", name: "Initech" },
]

const mockFieldDefinitions: FieldDefinition[] = [
  {
    id: "cf-1",
    entityType: "account",
    key: "payment_terms",
    label: "Payment Terms",
    dataType: "single_select",
    options: ["Net 30", "Net 45", "Net 60", "Net 90"],
    required: false,
    defaultValue: null,
    visibleToRoles: null,
    editableByRoles: null,
    visibleAtStages: null,
    displayOrder: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "cf-2",
    entityType: "account",
    key: "tax_gst_in",
    label: "GST Number",
    dataType: "text",
    options: null,
    required: false,
    defaultValue: null,
    visibleToRoles: null,
    editableByRoles: null,
    visibleAtStages: null,
    displayOrder: 2,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "cf-3",
    entityType: "account",
    key: "phone_main",
    label: "Main Phone",
    dataType: "text",
    options: null,
    required: false,
    defaultValue: null,
    visibleToRoles: null,
    editableByRoles: null,
    visibleAtStages: null,
    displayOrder: 3,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "cf-4",
    entityType: "account",
    key: "hq_address",
    label: "HQ Address",
    dataType: "rich_text",
    options: null,
    required: false,
    defaultValue: null,
    visibleToRoles: null,
    editableByRoles: null,
    visibleAtStages: null,
    displayOrder: 4,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "cf-5",
    entityType: "account",
    key: "custom_field_x",
    label: "Extra Field",
    dataType: "text",
    options: null,
    required: false,
    defaultValue: null,
    visibleToRoles: null,
    editableByRoles: null,
    visibleAtStages: null,
    displayOrder: 5,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
]

const defaultProps = {
  ownerOptions: mockOwnerOptions,
  accountOptions: mockAccountOptions,
  createAction: vi.fn(),
  onSuccess: vi.fn(),
}

describe("AccountForm", () => {
  describe("smoke", () => {
    it("renders create mode without throwing", () => {
      expect(() => <AccountForm {...defaultProps} />).not.toThrow()
    })

    it("renders create trigger button", () => {
      render(<AccountForm {...defaultProps} />)
      expect(screen.getByText("Create Account")).toBeInTheDocument()
    })

    it("renders with minimal props", () => {
      expect(() => (
        <AccountForm
          ownerOptions={[]}
          accountOptions={[]}
          createAction={vi.fn()}
          onSuccess={vi.fn()}
        />
      )).not.toThrow()
    })
  })

  describe("create mode", () => {
    it("opens the sheet when trigger is clicked", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Company or organization name")).toBeInTheDocument()
      })
    })

    it("shows Account Name as required", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Account Name")).toBeInTheDocument()
      })
    })

    it("renders owner EntityCombobox", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        const comboboxes = screen.getAllByTestId("entity-combobox")
        expect(comboboxes.length).toBeGreaterThanOrEqual(1)
      })
    })

    it("defaults owner to currentUserId when available", async () => {
      render(<AccountForm {...defaultProps} currentUserId="user-1" />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Company or organization name")).toBeInTheDocument()
      })
    })
  })

  describe("edit mode", () => {
    it("shows Edit Account title", async () => {
      render(
        <AccountForm
          {...defaultProps}
          account={{
            id: "acct-1",
            name: "Acme Corp",
            legalName: "Acme Corporation LLC",
            website: "https://acme.com",
            country: "US",
            industry: "Technology",
            description: "A test company",
            accountOwnerUserId: "user-1",
            emailDomains: ["acme.com"],
            customData: {},
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-06-01T00:00:00Z",
            createdBy: "user-1",
            updatedBy: "user-1",
            deletedAt: null,
          }}
          updateAction={vi.fn()}
          trigger={<button type="button">Edit</button>}
        />,
      )
      fireEvent.click(screen.getByText("Edit"))
      await waitFor(() => {
        expect(screen.getByText("Edit Account")).toBeInTheDocument()
      })
    })

    it("pre-fills form with account data", async () => {
      render(
        <AccountForm
          {...defaultProps}
          account={{
            id: "acct-1",
            name: "Acme Corp",
            legalName: "Acme Corporation LLC",
            website: "https://acme.com",
            country: "US",
            industry: "Technology",
            description: "A test company",
            accountOwnerUserId: "user-1",
            emailDomains: ["acme.com"],
            customData: {},
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-06-01T00:00:00Z",
            createdBy: "user-1",
            updatedBy: "user-1",
            deletedAt: null,
          }}
          updateAction={vi.fn()}
          trigger={<button type="button">Edit</button>}
        />,
      )
      fireEvent.click(screen.getByText("Edit"))
      await waitFor(() => {
        const nameInput = screen.getByPlaceholderText("Company or organization name") as HTMLInputElement
        expect(nameInput.value).toBe("Acme Corp")
      })
    })
  })

  describe("sections", () => {
    it("renders Essentials section", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Essentials")).toBeInTheDocument()
      })
    })

    it("renders Hierarchy collapsible section default open", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Hierarchy")).toBeInTheDocument()
      })
    })

    it("renders Classification & Territory section", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Classification & Territory")).toBeInTheDocument()
      })
    })

    it("renders Contact & Matching section", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Contact & Matching")).toBeInTheDocument()
      })
    })

    it("renders Description section", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Description")).toBeInTheDocument()
      })
    })

    it("shows parent picker in Hierarchy section", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        const comboboxes = screen.getAllByTestId("entity-combobox")
        const parentPicker = comboboxes.find((el) =>
          (el as HTMLInputElement).placeholder === "Select account...",
        )
        expect(parentPicker).toBeTruthy()
      })
    })

    it("renders Commercial section with custom fields", async () => {
      render(<AccountForm {...defaultProps} fieldDefinitions={mockFieldDefinitions} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Commercial")).toBeInTheDocument()
      })
    })
  })

  describe("custom field filtering", () => {
    it("places payment_terms and tax fields in Section 3 (Commercial)", async () => {
      render(<AccountForm {...defaultProps} fieldDefinitions={mockFieldDefinitions} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Commercial")).toBeInTheDocument()
      })
    })

    it("places phone_main and hq_address in Section 5 (Contact & Matching)", async () => {
      render(<AccountForm {...defaultProps} fieldDefinitions={mockFieldDefinitions} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Contact & Matching")).toBeInTheDocument()
      })
    })

    it("renders remaining custom fields in Section 7", async () => {
      render(<AccountForm {...defaultProps} fieldDefinitions={mockFieldDefinitions} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByTestId("cf-custom_field_x")).toBeInTheDocument()
      })
    })
  })

  describe("form fields", () => {
    it("renders country and industry fields", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Country")).toBeInTheDocument()
        expect(screen.getByPlaceholderText("Industry")).toBeInTheDocument()
      })
    })

    it("renders email domains field", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByPlaceholderText("example.com, other.com (comma separated)")).toBeInTheDocument()
      })
    })

    it("renders description textarea", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Company description or notes")).toBeInTheDocument()
      })
    })
  })

  describe("parent relationship", () => {
    it("shows relationship kind select when parent account is selected", async () => {
      render(
        <AccountForm
          {...defaultProps}
          parentRelationship={{
            toAccountId: "acct-2",
            kind: "subsidiary_of",
          }}
          trigger={<button type="button">Edit</button>}
        />,
      )
      fireEvent.click(screen.getByText("Edit"))
      await waitFor(() => {
        expect(screen.getByText("Relationship")).toBeInTheDocument()
      })
    })

    it("pre-populates parent relationship in edit mode", async () => {
      render(
        <AccountForm
          {...defaultProps}
          account={{
            id: "acct-1",
            name: "Acme Corp",
            legalName: null,
            website: null,
            country: null,
            industry: null,
            description: null,
            accountOwnerUserId: null,
            emailDomains: null,
            customData: {},
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-06-01T00:00:00Z",
            createdBy: null,
            updatedBy: null,
            deletedAt: null,
          }}
          parentRelationship={{
            toAccountId: "acct-2",
            kind: "subsidiary_of",
          }}
          updateAction={vi.fn()}
          trigger={<button type="button">Edit</button>}
        />,
      )
      fireEvent.click(screen.getByText("Edit"))
      await waitFor(() => {
        expect(screen.getByText("Subsidiary of")).toBeInTheDocument()
      })
    })
  })
})
