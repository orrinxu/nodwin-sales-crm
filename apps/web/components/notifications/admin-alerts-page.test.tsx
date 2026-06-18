import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AdminAlertsPage } from "./admin-alerts-page"
import type { AdminAlert } from "@/lib/data/admin-alerts"

const mockRefresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("server-only", () => ({}))

const mockAcknowledgeAction = vi.fn()
const mockAcknowledgeAllAction = vi.fn()

const sampleAlerts: AdminAlert[] = [
  {
    id: "alert-1",
    title: "Email delivery failed",
    message: "Inbound email from client@example.com could not be processed.",
    type: "deadletter",
    metadata: {},
    acknowledgedAt: null,
    createdBy: "00000000-0000-0000-0000-000000000000",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "alert-2",
    title: "API rate limit approaching",
    message: "Slack integration rate limit at 80%.",
    type: "warning",
    metadata: {},
    acknowledgedAt: null,
    createdBy: "00000000-0000-0000-0000-000000000000",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "alert-3",
    title: "System backup completed",
    message: "Nightly backup completed successfully.",
    type: "info",
    metadata: {},
    acknowledgedAt: new Date(Date.now() - 86400000).toISOString(),
    createdBy: "00000000-0000-0000-0000-000000000000",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
]

function renderPage(alerts = sampleAlerts, total = 3) {
  return render(
    <AdminAlertsPage
      alerts={alerts}
      total={total}
      acknowledgeAction={mockAcknowledgeAction}
      acknowledgeAllAction={mockAcknowledgeAllAction}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("AdminAlertsPage", () => {
  it("renders without throwing", () => {
    expect(() => renderPage()).not.toThrow()
  })

  it("displays the page title and total count", () => {
    renderPage()
    expect(screen.getByText("Alerts & Notifications")).toBeInTheDocument()
    expect(screen.getByText(/3 total alert/)).toBeInTheDocument()
    expect(screen.getByText(/2 unread/)).toBeInTheDocument()
  })

  it("displays alerts in the table", () => {
    renderPage()
    expect(screen.getByText("Email delivery failed")).toBeInTheDocument()
    expect(screen.getByText("API rate limit approaching")).toBeInTheDocument()
  })

  it("hides acknowledged alerts by default", () => {
    renderPage()
    expect(screen.getByText("Email delivery failed")).toBeInTheDocument()
    expect(screen.getByText("API rate limit approaching")).toBeInTheDocument()
    expect(screen.queryByText("System backup completed")).not.toBeInTheDocument()
  })

  it("shows acknowledged alerts when toggled", async () => {
    const user = userEvent.setup()
    renderPage()

    const showAckCheckbox = screen.getByRole("checkbox", { name: /Show acknowledged/i })
    await user.click(showAckCheckbox)

    await waitFor(() => {
      expect(screen.getByText("System backup completed")).toBeInTheDocument()
    })
  })

  it("shows type badges for each alert", () => {
    renderPage()
    expect(screen.getByText("deadletter")).toBeInTheDocument()
    expect(screen.getByText("warning")).toBeInTheDocument()
  })

  it("filters by alert type", async () => {
    const user = userEvent.setup()
    renderPage()

    const typeFilter = screen.getByRole("combobox")
    await user.click(typeFilter)

    const warningOption = screen.getByRole("option", { name: "Warning" })
    await user.click(warningOption)

    await waitFor(() => {
      expect(screen.queryByText("Email delivery failed")).not.toBeInTheDocument()
      expect(screen.getByText("API rate limit approaching")).toBeInTheDocument()
    })
  })

  it("shows mark all read button when there are unread alerts", () => {
    renderPage()
    expect(screen.getByText("Mark all read")).toBeInTheDocument()
  })

  it("does not show mark all read button when all are acknowledged", () => {
    renderPage([
      {
        ...sampleAlerts[0],
        acknowledgedAt: new Date().toISOString(),
      },
      {
        ...sampleAlerts[1],
        acknowledgedAt: new Date().toISOString(),
      },
    ], 2)
    expect(screen.queryByText("Mark all read")).not.toBeInTheDocument()
  })

  it("calls acknowledgeAction when mark read button is clicked", async () => {
    const user = userEvent.setup()
    renderPage()

    const markReadButtons = screen.getAllByText("Mark read")
    await user.click(markReadButtons[0])

    expect(mockAcknowledgeAction).toHaveBeenCalledWith("alert-1")
  })

  it("calls acknowledgeAllAction when mark all read is clicked", async () => {
    const user = userEvent.setup()
    renderPage()

    const markAllBtn = screen.getByText("Mark all read")
    await user.click(markAllBtn)

    expect(mockAcknowledgeAllAction).toHaveBeenCalled()
  })

  it("shows empty state when no alerts match filters", () => {
    renderPage([], 0)
    expect(screen.getByText("No alerts found.")).toBeInTheDocument()
  })

  it("shows Unread badge for unread alerts", () => {
    renderPage()
    const unreadBadges = screen.getAllByText("Unread")
    expect(unreadBadges).toHaveLength(2)
  })

  it("shows checkboxes for row selection", () => {
    renderPage()
    const checkboxes = screen.getAllByRole("checkbox")
    expect(checkboxes.length).toBeGreaterThan(0)
  })
})
