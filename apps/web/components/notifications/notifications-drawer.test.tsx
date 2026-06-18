import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("server-only", () => ({}))

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
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
  it("renders without throwing", () => {
    expect(() =>
      render(<NotificationsDrawer.NotificationsDrawer />),
    ).not.toThrow()
  })

  it("renders the notification bell button", () => {
    render(<NotificationsDrawer.NotificationsDrawer />)
    const bellButton = screen.getByRole("button", { name: /notifications/i })
    expect(bellButton).toBeInTheDocument()
  })
})
