import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { IntegrationsPage } from "./integrations-page"
import type { EntityRecord } from "@/lib/data/entities"
import type {
  IntegrationSettingRecord,
  DriveConfigRecord,
  ConnectionHealthRecord,
} from "@/lib/data/integrations"

const mockRefresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockUpdateSetting = vi.fn()
const mockUpdateDrive = vi.fn()

const sampleEntities: EntityRecord[] = [
  {
    id: "ent-1",
    name: "Acme India",
    legalName: "Acme India Pvt Ltd",
    country: "IN",
    baseCurrency: "INR",
    fiscalYearStartMonth: 4,
    active: true,
    displayName: null,
    logoUrl: null,
    emailFooter: null,
    customData: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: null,
    updatedBy: null,
  },
  {
    id: "ent-2",
    name: "Acme US",
    legalName: "Acme US Inc",
    country: "US",
    baseCurrency: "USD",
    fiscalYearStartMonth: 1,
    active: true,
    displayName: null,
    logoUrl: null,
    emailFooter: null,
    customData: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: null,
    updatedBy: null,
  },
]

const sampleSettings: IntegrationSettingRecord[] = [
  {
    id: "set-gmail",
    entityId: "ent-1",
    provider: "gmail",
    enabled: true,
    config: {},
    healthStatus: "healthy",
    lastHealthCheckAt: "2026-06-18T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "set-sheets",
    entityId: "ent-1",
    provider: "google_sheets",
    enabled: false,
    config: {},
    healthStatus: "degraded",
    lastHealthCheckAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "set-docs",
    entityId: "ent-1",
    provider: "google_docs",
    enabled: true,
    config: {},
    healthStatus: "healthy",
    lastHealthCheckAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "set-slides",
    entityId: "ent-1",
    provider: "google_slides",
    enabled: false,
    config: {},
    healthStatus: "unknown",
    lastHealthCheckAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "set-slack",
    entityId: "ent-1",
    provider: "slack",
    enabled: true,
    config: { workspace: "acme.slack.com", channels: ["sales", "ops"], event_routing: {} },
    healthStatus: "healthy",
    lastHealthCheckAt: "2026-06-18T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "set-resend",
    entityId: "ent-1",
    provider: "resend",
    enabled: true,
    config: {
      domain: "mail.acme.com",
      inbound_domain: "inbound.acme.com",
      templates: [{ name: "Welcome", id: "tmpl-1" }, { name: "Invoice", id: "tmpl-2" }],
    },
    healthStatus: "healthy",
    lastHealthCheckAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "set-sf",
    entityId: "ent-1",
    provider: "salesforce",
    enabled: true,
    config: {
      field_map: "---\ndeal_name: Opportunity.Name\namount: Opportunity.Amount",
      import_history: [
        { id: "imp-1", status: "completed", progress: 100, timestamp: "2026-06-17T10:00:00Z" },
      ],
    },
    healthStatus: "healthy",
    lastHealthCheckAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
]

const sampleDriveConfig: DriveConfigRecord[] = [
  {
    id: "dc-1",
    entityId: "ent-1",
    accountsParentFolderId: "folder-accts-1",
    opportunitiesParentFolderId: "folder-opps-1",
    pnlParentFolderId: null,
    gmailParentFolderId: null,
    sheetsParentFolderId: "folder-sheets-1",
    docsParentFolderId: null,
    slidesParentFolderId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "dc-2",
    entityId: "ent-2",
    accountsParentFolderId: null,
    opportunitiesParentFolderId: "folder-opps-2",
    pnlParentFolderId: "folder-pnl-2",
    gmailParentFolderId: null,
    sheetsParentFolderId: null,
    docsParentFolderId: null,
    slidesParentFolderId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
]

const sampleHealth: ConnectionHealthRecord[] = [
  {
    provider: "gmail",
    entityId: "ent-1",
    entityName: "Acme India",
    healthStatus: "healthy",
    lastHealthCheckAt: "2026-06-18T00:00:00Z",
  },
  {
    provider: "slack",
    entityId: "ent-1",
    entityName: "Acme India",
    healthStatus: "healthy",
    lastHealthCheckAt: "2026-06-18T00:00:00Z",
  },
  {
    provider: "resend",
    entityId: "ent-1",
    entityName: "Acme India",
    healthStatus: "healthy",
    lastHealthCheckAt: null,
  },
  {
    provider: "salesforce",
    entityId: "ent-1",
    entityName: "Acme India",
    healthStatus: "healthy",
    lastHealthCheckAt: null,
  },
]

function renderPage() {
  return render(
    <IntegrationsPage
      settings={sampleSettings}
      driveConfig={sampleDriveConfig}
      health={sampleHealth}
      entities={sampleEntities}
      updateSettingAction={mockUpdateSetting}
      updateDriveConfigAction={mockUpdateDrive}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("IntegrationsPage", () => {
  it("renders the page heading and description", () => {
    renderPage()
    expect(screen.getByText("Integrations")).toBeInTheDocument()
    expect(
      screen.getByText("Manage external service integrations and connections."),
    ).toBeInTheDocument()
  })

  it("renders all four tab labels", () => {
    renderPage()
    expect(screen.getByText("Google Workspace")).toBeInTheDocument()
    expect(screen.getByText("Slack")).toBeInTheDocument()
    expect(screen.getByText("Email")).toBeInTheDocument()
    expect(screen.getByText("Salesforce")).toBeInTheDocument()
  })

  it("shows Google Workspace panel by default", () => {
    renderPage()
    expect(screen.getByText("Service Access")).toBeInTheDocument()
  })

  it("switches to Slack panel when Slack tab is clicked", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Slack"))
    expect(screen.getByText("Event Routing")).toBeInTheDocument()
  })

  it("switches to Email panel when Email tab is clicked", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Email"))
    expect(screen.getByText("Transactional Templates")).toBeInTheDocument()
  })

  it("switches to Salesforce panel when Salesforce tab is clicked", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Salesforce"))
    expect(screen.getByText("Field Mapping")).toBeInTheDocument()
  })
})

describe("Google Workspace section", () => {
  it("shows connection status badge", () => {
    renderPage()
    expect(screen.getByText("Connected")).toBeInTheDocument()
  })

  it("displays service access toggles with correct states", () => {
    renderPage()
    const gmailCheckbox = screen.getAllByRole("checkbox", { name: "" })
    expect(gmailCheckbox).toHaveLength(4)
  })

  it("calls updateSettingAction when a toggle is clicked", async () => {
    const user = userEvent.setup()
    mockUpdateSetting.mockResolvedValueOnce({})
    renderPage()
    const checkboxes = screen.getAllByRole("checkbox", { name: "" })
    await user.click(checkboxes[1])
    expect(mockUpdateSetting).toHaveBeenCalledWith(
      expect.objectContaining({ id: "set-sheets", enabled: true }),
    )
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("renders drive config table with entity names", () => {
    renderPage()
    expect(screen.getByText("Acme India")).toBeInTheDocument()
    expect(screen.getByText("Acme US")).toBeInTheDocument()
  })

  it("shows folder ID inputs in drive config table", () => {
    renderPage()
    const inputs = screen.getAllByPlaceholderText("Folder ID")
    expect(inputs.length).toBeGreaterThan(0)
  })
})

describe("Slack section", () => {
  it("shows connection status and workspace name", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Slack"))
    expect(screen.getByText("acme.slack.com")).toBeInTheDocument()
  })

  it("renders event routing matrix with channels", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Slack"))
    expect(screen.getByText("#sales")).toBeInTheDocument()
    expect(screen.getByText("#ops")).toBeInTheDocument()
  })
})

describe("Email section", () => {
  it("shows Resend domain and inbound domain", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Email"))
    expect(screen.getByText("mail.acme.com")).toBeInTheDocument()
    expect(screen.getByText("inbound.acme.com")).toBeInTheDocument()
  })

  it("shows transactional templates table", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Email"))
    expect(screen.getByText("Welcome")).toBeInTheDocument()
    expect(screen.getByText("Invoice")).toBeInTheDocument()
  })
})

describe("Salesforce section", () => {
  it("shows connection status", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Salesforce"))
    expect(screen.getByText("Connection Status")).toBeInTheDocument()
  })

  it("renders field map as pre-formatted text", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Salesforce"))
    expect(screen.getByText(/deal_name/)).toBeInTheDocument()
  })

  it("shows import history table", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Salesforce"))
    expect(screen.getByText("Import History")).toBeInTheDocument()
  })
})
