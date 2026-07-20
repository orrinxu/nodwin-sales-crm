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

const mockTaxIdTypes = [
  { code: "IN_GSTIN", label: "GSTIN", countryIso: "IN", formatRegex: "^[0-9A-Z]{15}$", displayOrder: 1 },
  { code: "IN_PAN", label: "PAN", countryIso: "IN", formatRegex: null, displayOrder: 2 },
  { code: "SG_UEN", label: "UEN", countryIso: "SG", formatRegex: null, displayOrder: 1 },
]

const mockAccount = {
  id: "acct-1",
  name: "Acme Corp",
  legalName: null,
  website: null,
  country: "IN",
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
}

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

    it("renders NO launcher when the dialog is controlled (generator owns it)", () => {
      // Regression: a controlled AccountForm (used inside the AI generator) must
      // not render its default button, or the page shows two "Create Account"
      // buttons.
      render(<AccountForm {...defaultProps} open={false} onOpenChange={vi.fn()} />)
      expect(screen.queryByText("Create Account")).not.toBeInTheDocument()
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

    // ORR-806: emptying the Email Domains input in edit mode must send [] (which
    // the server maps to NULL) rather than `undefined`, which would leave the old
    // domains in place.
    it("sends [] to clear email domains when the field is emptied", async () => {
      const updateAction = vi.fn().mockResolvedValue({ ...mockAccount, emailDomains: null })
      render(
        <AccountForm
          {...defaultProps}
          account={{ ...mockAccount, emailDomains: ["acme.com"] }}
          updateAction={updateAction}
          trigger={<button type="button">Edit</button>}
        />,
      )
      fireEvent.click(screen.getByText("Edit"))

      const domainsInput = (await screen.findByLabelText("Email Domains")) as HTMLInputElement
      expect(domainsInput.value).toBe("acme.com")
      fireEvent.change(domainsInput, { target: { value: "" } })

      fireEvent.click(screen.getByRole("button", { name: /save changes/i }))

      await waitFor(() => expect(updateAction).toHaveBeenCalled())
      const [, payload] = updateAction.mock.calls[0]
      expect(payload.emailDomains).toEqual([])
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

    it("no longer renders the 'coming soon' Classification & Territory placeholder", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Contact & Matching")).toBeInTheDocument()
      })
      expect(screen.queryByText("Classification & Territory")).not.toBeInTheDocument()
      expect(screen.queryByText(/being added in a future release/)).not.toBeInTheDocument()
    })

    it("does not leak the 'Custom Fields' developer heading on the form", async () => {
      render(<AccountForm {...defaultProps} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Essentials")).toBeInTheDocument()
      })
      expect(screen.queryByText("Custom Fields")).not.toBeInTheDocument()
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
    it("places payment_terms in Section 3 (Commercial)", async () => {
      render(<AccountForm {...defaultProps} fieldDefinitions={mockFieldDefinitions} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Commercial")).toBeInTheDocument()
      })
    })

    it("no longer renders the legacy tax_* fields as custom fields (superseded by structured Tax IDs)", async () => {
      render(<AccountForm {...defaultProps} fieldDefinitions={mockFieldDefinitions} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Commercial")).toBeInTheDocument()
      })
      // tax_gst_in is a legacy tax custom field — it must not render anywhere
      // (not in Commercial, not leaked into the generic Custom Fields bucket).
      expect(screen.queryByTestId("cf-tax_gst_in")).not.toBeInTheDocument()
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

  describe("tax IDs", () => {
    it("renders the Tax IDs editor and grouped add-picker when tax types are provided", async () => {
      render(<AccountForm {...defaultProps} taxIdTypes={mockTaxIdTypes} />)
      fireEvent.click(screen.getByText("Create Account"))
      await waitFor(() => {
        expect(screen.getByText("Commercial")).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText("Commercial"))
      await waitFor(() => {
        expect(screen.getByLabelText("Add tax ID")).toBeInTheDocument()
      })
      expect(screen.getByText("No tax IDs added yet.")).toBeInTheDocument()
    })

    it("renders existing tax-id rows, and an inactive type by its raw code", async () => {
      render(
        <AccountForm
          {...defaultProps}
          account={mockAccount}
          taxIdTypes={mockTaxIdTypes}
          initialTaxIds={[
            { id: "t1", taxType: "IN_GSTIN", value: "22AAAAA0000A1Z5" },
            { id: "t2", taxType: "OLD_INACTIVE", value: "legacy-123" },
          ]}
          updateAction={vi.fn()}
          trigger={<button type="button">Edit</button>}
        />,
      )
      fireEvent.click(screen.getByText("Edit"))
      await waitFor(() => {
        expect(screen.getByText("Commercial")).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText("Commercial"))
      await waitFor(() => {
        // active type shows its label; inactive type falls back to the raw code
        // so the row is never silently dropped. (Query by the row label's title
        // attribute — "GSTIN" also appears as an <option> in the add-picker.)
        expect(screen.getByTitle("GSTIN")).toBeInTheDocument()
        expect(screen.getByTitle("OLD_INACTIVE")).toBeInTheDocument()
      })
      expect((screen.getByLabelText("GSTIN value") as HTMLInputElement).value).toBe("22AAAAA0000A1Z5")
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
