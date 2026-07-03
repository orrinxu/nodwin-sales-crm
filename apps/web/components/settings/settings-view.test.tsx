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
    updateProfileAction: vi.fn().mockResolvedValue(undefined),
    updateLocalizationAction: vi.fn().mockResolvedValue(undefined),
    updateAppearanceAction: vi.fn().mockResolvedValue(undefined),
    updateNotificationOverrideAction: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe("SettingsView", () => {
  beforeEach(() => mockRefresh.mockClear())

  it("renders all sections", () => {
    render(<SettingsView {...makeProps()} />)
    expect(screen.getByText("Profile")).toBeInTheDocument()
    expect(screen.getByText("Localization & region")).toBeInTheDocument()
    expect(screen.getByText("Notifications")).toBeInTheDocument()
    expect(screen.getByText("Appearance")).toBeInTheDocument()
    expect(screen.getByText("Integrations")).toBeInTheDocument()
    expect(screen.getByText("Security & access")).toBeInTheDocument()
  })

  it("shows read-only profile fields", () => {
    render(<SettingsView {...makeProps()} />)
    expect(screen.getByText("rep@nodwin.com")).toBeInTheDocument()
    expect(screen.getByText("Nodwin Alpha")).toBeInTheDocument()
    expect(screen.getByText("rep-abc123@crm.nodwin.com")).toBeInTheDocument()
  })

  it("saves the profile", async () => {
    const props = makeProps()
    render(<SettingsView {...props} />)
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }))
    await waitFor(() => {
      expect(props.updateProfileAction).toHaveBeenCalledWith({ fullName: "Sales Rep", jobTitle: null })
    })
  })

  it("toggles a notification override", async () => {
    const props = makeProps()
    render(<SettingsView {...props} />)
    // Default toggles are ON; clicking the email switch for the first event turns it off.
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

  it("flags Slack as coming soon and shows the localization note", () => {
    render(<SettingsView {...makeProps()} />)
    expect(screen.getByText(/Slack delivery is coming soon/)).toBeInTheDocument()
    expect(screen.getByText(/not yet applied across every view/)).toBeInTheDocument()
  })
})
