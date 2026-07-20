import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("server-only", () => ({}))

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // The drawer now fetches the feed on mount (to show the unread badge without
  // opening it), so give fetch a valid empty response to resolve.
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ notifications: [], unreadCount: 0 }),
  })
  globalThis.fetch = mockFetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

let NotificationsDrawer: { NotificationsDrawer: React.ComponentType }

beforeEach(async () => {
  NotificationsDrawer = await import("./notifications-drawer")
})

describe("NotificationsDrawer", () => {
  it("renders without throwing", async () => {
    expect(() =>
      render(<NotificationsDrawer.NotificationsDrawer />),
    ).not.toThrow()
    // Flush the mount fetch so its state update settles inside act().
    await screen.findByRole("button", { name: /notifications/i })
  })

  it("renders the notification bell button", async () => {
    render(<NotificationsDrawer.NotificationsDrawer />)
    const bellButton = await screen.findByRole("button", { name: /notifications/i })
    expect(bellButton).toBeInTheDocument()
  })
})
