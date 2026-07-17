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
    ...overrides,
  }
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

  it("Integrations copy is accurate and links to the Access tokens tab", async () => {
    render(<SettingsView {...makeProps()} />)
    await openTab("Integrations")
    // Drive is described as a live per-user import, not "Not connected".
    expect(screen.getByText(/Import files from Google Drive/)).toBeInTheDocument()
    // No stale MCP "coming soon" row.
    expect(screen.queryByText(/MCP/)).not.toBeInTheDocument()
    // The tokens link switches to the Access tokens tab.
    await userEvent.click(screen.getByRole("button", { name: "Access tokens" }))
    expect(screen.getByText("Generate a token")).toBeInTheDocument()
  })

  it("Security lists the real sign-in methods, not Google-only", async () => {
    render(<SettingsView {...makeProps()} />)
    await openTab("Security")
    expect(screen.getByText(/magic link/)).toBeInTheDocument()
  })
})
