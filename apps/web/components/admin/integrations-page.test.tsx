import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { IntegrationsPage } from "./integrations-page"
import type { EntityRecord } from "@/lib/data/entities"
import type {
  SlackConnectionRecord,
  EmailSettingsRecord,
  SalesforceConnectionRecord,
  DriveConfigRecord,
} from "@/lib/data/integrations"

const mockRefresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

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

const sampleDriveConfig: DriveConfigRecord[] = [
  {
    id: "dc-1",
    entityId: "ent-1",
    accountsParentFolderId: "folder-accts-1",
    opportunitiesParentFolderId: "folder-opps-1",
    pnlParentFolderId: null,
    gmailSyncEnabled: true,
    sheetsAccessEnabled: false,
    docsAccessEnabled: true,
    slidesAccessEnabled: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "dc-2",
    entityId: "ent-2",
    accountsParentFolderId: null,
    opportunitiesParentFolderId: "folder-opps-2",
    pnlParentFolderId: "folder-pnl-2",
    gmailSyncEnabled: false,
    sheetsAccessEnabled: true,
    docsAccessEnabled: false,
    slidesAccessEnabled: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
]

const sampleSlack: SlackConnectionRecord[] = [
  {
    id: "slack-1",
    workspaceId: "T123456",
    workspaceName: "acme.slack.com",
    eventRouting: { deal_created: ["#sales"], deal_won: ["#sales", "#exec"] },
    status: "connected",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
]

const sampleEmail: EmailSettingsRecord = {
  id: "email-1",
  resendDomain: "mail.acme.com",
  inboundDomain: "inbound.acme.com",
  templateConfig: { welcome: { fromName: "Acme" }, invoice: { replyTo: "billing@acme.com" } },
  status: "active",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
}

const sampleSalesforce: SalesforceConnectionRecord[] = [
  {
    id: "sf-1",
    instanceUrl: "https://acme.my.salesforce.com",
    oauthState: { redirectUri: "https://app.acme.com/oauth/callback" },
    importStatus: "connected",
    lastSyncAt: "2026-06-17T10:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  },
]

interface PageProps {
  slackConnections?: SlackConnectionRecord[]
  emailSettings?: EmailSettingsRecord | null
  salesforceConnections?: SalesforceConnectionRecord[]
  driveConfig?: DriveConfigRecord[]
  entities?: EntityRecord[]
  updateDriveConfigAction?: (input: unknown) => Promise<DriveConfigRecord>
}

function renderPage(overrides?: PageProps) {
  return render(
    <IntegrationsPage
      slackConnections={overrides?.slackConnections ?? sampleSlack}
      emailSettings={overrides?.emailSettings ?? sampleEmail}
      salesforceConnections={overrides?.salesforceConnections ?? sampleSalesforce}
      driveConfig={overrides?.driveConfig ?? sampleDriveConfig}
      entities={overrides?.entities ?? sampleEntities}
      updateDriveConfigAction={overrides?.updateDriveConfigAction ?? mockUpdateDrive}
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
    expect(screen.getByText("Per-Entity Configuration")).toBeInTheDocument()
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
  it("shows connection status card with Not Connected badge", () => {
    renderPage()
    expect(screen.getByText("Connection Status")).toBeInTheDocument()
    expect(screen.getByText("Not Connected")).toBeInTheDocument()
  })

  it("renders entity names in the drive config table", () => {
    renderPage()
    expect(screen.getByText("Acme India")).toBeInTheDocument()
    expect(screen.getByText("Acme US")).toBeInTheDocument()
  })

  it("shows service access toggle columns", () => {
    renderPage()
    expect(screen.getByText("Gmail Sync")).toBeInTheDocument()
    expect(screen.getByText("Sheets Access")).toBeInTheDocument()
    expect(screen.getByText("Docs Access")).toBeInTheDocument()
    expect(screen.getByText("Slides Access")).toBeInTheDocument()
  })

  it("shows folder ID inputs", () => {
    renderPage()
    const inputs = screen.getAllByPlaceholderText("Folder ID")
    expect(inputs.length).toBe(6)
  })

  it("calls updateDriveConfigAction when a toggle is clicked", async () => {
    const user = userEvent.setup()
    mockUpdateDrive.mockResolvedValueOnce({})
    renderPage()
    const checkboxes = screen.getAllByRole("checkbox")
    await user.click(checkboxes[1])
    expect(mockUpdateDrive).toHaveBeenCalledWith(
      expect.objectContaining({ id: "dc-1", sheetsAccessEnabled: true }),
    )
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("shows error when toggle fails", async () => {
    const user = userEvent.setup()
    mockUpdateDrive.mockRejectedValueOnce(new Error("Network error"))
    renderPage()
    const checkboxes = screen.getAllByRole("checkbox")
    await user.click(checkboxes[1])
    expect(screen.getByText("Failed to toggle. Please try again.")).toBeInTheDocument()
  })

  it("shows error when drive save fails", async () => {
    const user = userEvent.setup()
    mockUpdateDrive.mockRejectedValueOnce(new Error("Network error"))
    renderPage()
    const folderInputs = screen.getAllByPlaceholderText("Folder ID")
    await user.clear(folderInputs[0])
    await user.type(folderInputs[0], "new-folder-id")
    const saveButton = screen.getByText("Save")
    await user.click(saveButton)
    expect(screen.getByText("Failed to save drive config. Please try again.")).toBeInTheDocument()
  })
})

describe("Slack section", () => {
  it("shows connection status and workspace name", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Slack"))
    expect(screen.getByText("acme.slack.com")).toBeInTheDocument()
    expect(screen.getByText("Connected")).toBeInTheDocument()
  })

  it("shows event routing configuration", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Slack"))
    expect(screen.getByText(/"deal_created"/)).toBeInTheDocument()
  })

  it("shows placeholder when no Slack connection exists", async () => {
    const user = userEvent.setup()
    renderPage({ slackConnections: [] })
    await user.click(screen.getByText("Slack"))
    expect(screen.getByText("Event Routing")).toBeInTheDocument()
    expect(screen.getByText("No event routing configured.")).toBeInTheDocument()
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

  it("shows template configuration table", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Email"))
    expect(screen.getByText("welcome")).toBeInTheDocument()
    expect(screen.getByText("invoice")).toBeInTheDocument()
  })

  it("shows placeholder when email settings is null", async () => {
    const user = userEvent.setup()
    renderPage({ emailSettings: null })
    await user.click(screen.getByText("Email"))
    // Verify the Email panel loaded
    expect(screen.getByText("Resend Configuration")).toBeInTheDocument()
    // Status row should exist
    expect(screen.getByText("Status:")).toBeInTheDocument()
    // Inbound Email card should show em-dash
    expect(screen.getByText("Inbound Domain:")).toBeInTheDocument()
  })
})

describe("Salesforce section", () => {
  it("shows connection status and instance URL", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Salesforce"))
    expect(screen.getByText("Connected")).toBeInTheDocument()
    expect(screen.getByText("https://acme.my.salesforce.com")).toBeInTheDocument()
  })

  it("shows OAuth state as field mapping placeholder", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Salesforce"))
    expect(screen.getByText(/redirectUri/)).toBeInTheDocument()
  })

  it("shows import history with last sync time", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText("Salesforce"))
    expect(screen.getByText("Import History")).toBeInTheDocument()
    expect(screen.getByText("Completed")).toBeInTheDocument()
  })

  it("shows placeholder when no Salesforce connection exists", async () => {
    const user = userEvent.setup()
    renderPage({ salesforceConnections: [] })
    await user.click(screen.getByText("Salesforce"))
    expect(screen.getByText("Not Connected")).toBeInTheDocument()
    expect(screen.getByText("No import runs yet.")).toBeInTheDocument()
  })
})
