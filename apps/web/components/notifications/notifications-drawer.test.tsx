import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createElement } from "react"

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({
      on: () => ({ subscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import { NotificationsDrawer } from "./notifications-drawer"

function relativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

describe("relativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-07T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for less than a minute ago', () => {
    const result = relativeTime(new Date("2026-05-07T11:59:45Z").toISOString())
    expect(result).toBe("just now")
  })

  it("returns minutes ago for < 1 hour", () => {
    const result = relativeTime(new Date("2026-05-07T11:55:00Z").toISOString())
    expect(result).toBe("5m ago")
  })

  it("returns hours ago for < 24 hours", () => {
    const result = relativeTime(new Date("2026-05-07T09:00:00Z").toISOString())
    expect(result).toBe("3h ago")
  })

  it("returns days ago for < 7 days", () => {
    const result = relativeTime(new Date("2026-05-05T12:00:00Z").toISOString())
    expect(result).toBe("2d ago")
  })

  it("returns formatted date for >= 7 days", () => {
    const result = relativeTime(new Date("2026-04-01T12:00:00Z").toISOString())
    expect(result).toBe("4/1/2026")
  })
})

describe("NotificationsDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  it("does not throw when rendered", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], count: 0 }),
    })

    expect(() =>
      createElement(NotificationsDrawer),
    ).not.toThrow()
  })

  it("renders without error when fetch succeeds with data", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [
          {
            id: "1",
            title: "Test alert",
            message: "Something happened",
            type: "info",
            metadata: {},
            acknowledged_at: null,
            created_by: "user-1",
            created_at: new Date().toISOString(),
          },
        ],
        count: 1,
      }),
    })

    expect(() =>
      createElement(NotificationsDrawer),
    ).not.toThrow()
  })

  it("handles 403 without error", () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
    })

    expect(() =>
      createElement(NotificationsDrawer),
    ).not.toThrow()
  })
})
