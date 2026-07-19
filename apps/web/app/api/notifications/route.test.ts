import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const mockRequireUser = vi.fn()
vi.mock("@/lib/security/auth", () => ({
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
}))

const mockGetUserNotifications = vi.fn()
const mockGetUnreadCount = vi.fn()
const mockMarkRead = vi.fn()
const mockMarkAllRead = vi.fn()
vi.mock("@/lib/data/notifications", () => ({
  getUserNotifications: (...args: unknown[]) => mockGetUserNotifications(...args),
  getUnreadNotificationCount: (...args: unknown[]) => mockGetUnreadCount(...args),
  markNotificationRead: (...args: unknown[]) => mockMarkRead(...args),
  markAllNotificationsRead: (...args: unknown[]) => mockMarkAllRead(...args),
}))

const USER = { id: "user-1", email: "u@example.com", role: "sales_rep" }

function getRequest(url = "https://crm.example.com/api/notifications"): NextRequest {
  return new Request(url, { method: "GET" }) as unknown as NextRequest
}

function patchRequest(body: unknown): NextRequest {
  return new Request("https://crm.example.com/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireUser.mockResolvedValue(USER)
})

describe("GET /api/notifications", () => {
  it("returns the caller's own feed and unread count", async () => {
    mockGetUserNotifications.mockResolvedValue({
      notifications: [{ id: "n1", title: "Deal won", message: "x", linkUrl: "/opportunities/1", readAt: null, createdAt: "2026-07-19T00:00:00Z" }],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    mockGetUnreadCount.mockResolvedValue(1)

    const { GET } = await import("./route")
    const res = await GET(getRequest("https://crm.example.com/api/notifications?pageSize=20"))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.notifications).toHaveLength(1)
    expect(json.unreadCount).toBe(1)
    // scoped to the caller's id (RLS also enforces this server-side)
    expect(mockGetUserNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "user-1" }) }),
      "user-1",
      false,
      undefined,
      20,
    )
  })

  it("401s when unauthenticated", async () => {
    const { UnauthorisedError } = await import("@/lib/security/errors")
    mockRequireUser.mockRejectedValue(new UnauthorisedError("no session"))

    const { GET } = await import("./route")
    const res = await GET(getRequest())
    expect(res.status).toBe(401)
  })
})

describe("PATCH /api/notifications", () => {
  it("marks a single notification read", async () => {
    mockMarkRead.mockResolvedValue(undefined)
    const { PATCH } = await import("./route")
    const res = await PATCH(patchRequest({ id: "n1" }))

    expect(res.status).toBe(200)
    expect(mockMarkRead).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "user-1" }) }),
      "n1",
    )
    expect(mockMarkAllRead).not.toHaveBeenCalled()
  })

  it("marks all read when { all: true }", async () => {
    mockMarkAllRead.mockResolvedValue(undefined)
    const { PATCH } = await import("./route")
    const res = await PATCH(patchRequest({ all: true }))

    expect(res.status).toBe(200)
    expect(mockMarkAllRead).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "user-1" }) }),
      "user-1",
    )
  })

  it("400s when neither id nor all is provided", async () => {
    const { PATCH } = await import("./route")
    const res = await PATCH(patchRequest({}))
    expect(res.status).toBe(400)
  })
})
