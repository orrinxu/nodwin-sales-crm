/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { SettingsView } from "./settings-view"
import { DEFAULT_USER_PREFERENCES } from "@/lib/data/user-preferences"
import type { OwnProfileRecord } from "@/lib/data/user-profile"

const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }) }))
vi.mock("server-only", () => ({}))
vi.mock("@/components/theme/theme-provider", () => ({ useTheme: () => ({ setTheme: vi.fn() }) }))
vi.mock("@/lib/auth/session-manager", () => ({ useSignOut: () => ({ signOut: vi.fn() }) }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))

const profile: OwnProfileRecord = {
  id: "u1",
  email: "rep@nodwin.com",
  fullName: "Sales Rep",
  role: "sales_rep",
  entityName: "Nodwin Alpha",
  businessUnitName: "East Asia",
  crmInboundEmail: "rep-abc123@crm.nodwin.com",
}

function makeProps(overrides = {}) {
  return {
    preferences: { ...DEFAULT_USER_PREFERENCES },
    profile,
    currencies: [
      { code: "USD", name: "US Dollar" },
      { code: "INR", name: "Indian Rupee" },
    ],
    notificationOverrides: [],
    tokens: [],
    updateProfileAction: vi.fn().mockResolvedValue(undefined),
    updateLocalizationAction: vi.fn().mockResolvedValue(undefined),
    updateAppearanceAction: vi.fn().mockResolvedValue(undefined),
    updateNotificationOverrideAction: vi.fn().mockResolvedValue(undefined),
    createTokenAction: vi.fn().mockResolvedValue({ token: "nodpat_x", record: {} }),
    revokeTokenAction: vi.fn().mockResolvedValue(undefined),
    googleConnection: null,
    disconnectGoogleAction: vi.fn().mockResolvedValue(undefined),
    calendarSyncState: {
      syncEnabled: false,
      status: "idle",
      lastSyncAt: null,
      lastError: null,
      calendarId: "primary",
      exists: false,
    },
    setCalendarSyncEnabledAction: vi.fn().mockResolvedValue(undefined),
    syncCalendarNowAction: vi.fn().mockResolvedValue({ ok: true, upserted: 0, removed: 0 }),
    ...overrides,
  }
}

// A Google connection that has granted the calendar.events scope.
const calendarConnection = {
  googleAccountEmail: "rep@nodwin.com",
  grantedScopes: [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/calendar.events",
  ],
  status: "connected",
  accessTokenExpiresAt: null,
  connected: true,
}

// Settings is organised into facet tabs; inactive panels are unmounted.
const openTab = (name: string | RegExp) => userEvent.click(screen.getByRole("tab", { name }))

describe("SettingsView", () => {
  beforeEach(() => mockRefresh.mockClear())

  it("renders a tab for each settings area", () => {
    render(<SettingsView {...makeProps()} />)
    for (const name of ["Profile", "Localization", "Notifications", "Appearance", "Access tokens", "Integrations", "Security"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument()
    }
  })

  it("shows read-only profile fields on the default Profile tab", () => {
    render(<SettingsView {...makeProps()} />)
    expect(screen.getByText("rep@nodwin.com")).toBeInTheDocument()
    expect(screen.getByText("Nodwin Alpha")).toBeInTheDocument()
    expect(screen.getByText("rep-abc123@crm.nodwin.com")).toBeInTheDocument()
  })

  it("saves the profile via the unsaved-changes bar after an edit", async () => {
    const props = makeProps()
    render(<SettingsView {...props} />)
    // The SaveBar only appears once a field is dirty.
    const nameInput = screen.getByDisplayValue("Sales Rep")
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "New Name")
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => {
      expect(props.updateProfileAction).toHaveBeenCalledWith({ fullName: "New Name", jobTitle: null })
    })
  })

  it("toggles a notification override from the Notifications tab", async () => {
    const props = makeProps()
    render(<SettingsView {...props} />)
    await openTab("Notifications")
    const emailSwitch = screen.getByLabelText("Email for Deal stage changes")
    await userEvent.click(emailSwitch)
    await waitFor(() => {
      expect(props.updateNotificationOverrideAction).toHaveBeenCalledWith({
        eventType: "stage_change",
        channel: "email",
        enabled: false,
      })
    })
  })

  it("notes Slack is admin-configured (Notifications) and shows the localization note", async () => {
    render(<SettingsView {...makeProps()} />)
    await openTab("Notifications")
    expect(screen.getByText(/Slack delivery is configured by your admin/)).toBeInTheDocument()
    await openTab("Localization")
    expect(
      screen.getByText(/Number, date, and timezone preferences apply across the app/),
    ).toBeInTheDocument()
  })

  it("Integrations shows a Connect Google link when not connected and links to the Access tokens tab", async () => {
    render(<SettingsView {...makeProps()} />)
    await openTab("Integrations")
    // Not connected → a plain anchor to the authorize GET route + a status badge.
    const connect = screen.getByRole("link", { name: "Connect Google" })
    expect(connect).toHaveAttribute("href", expect.stringContaining("/api/integrations/google/authorize"))
    // Both the Workspace and Calendar rows show a "Not connected" badge here.
    expect(screen.getAllByText("Not connected").length).toBeGreaterThanOrEqual(1)
    // No stale MCP "coming soon" row.
    expect(screen.queryByText(/MCP/)).not.toBeInTheDocument()
    // The tokens link switches to the Access tokens tab.
    await userEvent.click(screen.getByRole("button", { name: "Access tokens" }))
    expect(screen.getByText("Generate a token")).toBeInTheDocument()
  })

  it("Integrations shows the connected account, scopes, and a working Disconnect button", async () => {
    const props = makeProps({
      googleConnection: {
        googleAccountEmail: "rep@nodwin.com",
        grantedScopes: ["https://www.googleapis.com/auth/drive.readonly"],
        status: "connected",
        accessTokenExpiresAt: null,
        connected: true,
      },
    })
    render(<SettingsView {...props} />)
    await openTab("Integrations")
    expect(screen.getByText(/Connected as/)).toBeInTheDocument()
    expect(screen.getByText("Drive (read-only)")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Connect Google" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Disconnect/ }))
    await waitFor(() => {
      expect(props.disconnectGoogleAction).toHaveBeenCalled()
    })
  })

  it("Calendar row shows a Connect link when calendar.events is not granted", async () => {
    render(<SettingsView {...makeProps()} />)
    await openTab("Integrations")
    const connect = screen.getByRole("link", { name: "Connect Google Calendar" })
    expect(connect).toHaveAttribute(
      "href",
      expect.stringContaining("calendar.events"),
    )
  })

  it("Calendar row shows the sync toggle + Sync now when calendar.events is granted", async () => {
    const props = makeProps({
      googleConnection: calendarConnection,
      calendarSyncState: {
        syncEnabled: true,
        status: "idle",
        lastSyncAt: null,
        lastError: null,
        calendarId: "primary",
        exists: true,
      },
    })
    render(<SettingsView {...props} />)
    await openTab("Integrations")
    // No connect link once calendar is connected.
    expect(
      screen.queryByRole("link", { name: "Connect Google Calendar" }),
    ).not.toBeInTheDocument()
    // Sync-enabled toggle reflects the current state and is toggleable.
    const toggle = screen.getByLabelText("Enable Google Calendar sync")
    expect(toggle).toBeChecked()
    await userEvent.click(toggle)
    await waitFor(() => {
      expect(props.setCalendarSyncEnabledAction).toHaveBeenCalledWith(false)
    })
    // Sync now triggers the action.
    await userEvent.click(screen.getByRole("button", { name: /Sync now/ }))
    await waitFor(() => {
      expect(props.syncCalendarNowAction).toHaveBeenCalled()
    })
  })

  it("surfaces a skipped Sync-now result as an informative message", async () => {
    const props = makeProps({
      googleConnection: calendarConnection,
      calendarSyncState: {
        syncEnabled: false,
        status: "idle",
        lastSyncAt: null,
        lastError: null,
        calendarId: "primary",
        exists: true,
      },
      syncCalendarNowAction: vi.fn().mockResolvedValue({ ok: true, skipped: true }),
    })
    render(<SettingsView {...props} />)
    await openTab("Integrations")
    await userEvent.click(screen.getByRole("button", { name: /Sync now/ }))
    await waitFor(() => {
      expect(screen.getByText(/Nothing to sync/)).toBeInTheDocument()
    })
  })

  it("surfaces the ?google=connected callback flag as a banner and lands on Integrations", () => {
    render(<SettingsView {...makeProps({ googleCallbackStatus: "connected" })} />)
    expect(screen.getByText("Google account connected.")).toBeInTheDocument()
  })

  it("Security lists the real sign-in methods, not Google-only", async () => {
    render(<SettingsView {...makeProps()} />)
    await openTab("Security")
    expect(screen.getByText(/magic link/)).toBeInTheDocument()
  })
})
