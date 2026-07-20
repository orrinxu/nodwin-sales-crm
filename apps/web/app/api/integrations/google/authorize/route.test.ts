// @vitest-environment node
// The handler signs a JWT state via jose, which requires the Node runtime.
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

vi.mock("@/lib/security/env", () => ({
  env: {
    SUPABASE_JWT_SECRET: "test-jwt-secret-value-at-least-32chars-long",
    NODE_ENV: "test",
    APP_URL: "https://crm.nodwin.com",
  },
}))

const mockRequireUser = vi.fn()
vi.mock("@/lib/security/auth", () => ({
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
}))

const mockBuildAuthUrl = vi.fn()
vi.mock("@/lib/integrations/google/oauth-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/google/oauth-client")
  >("@/lib/integrations/google/oauth-client")
  return {
    ...actual,
    buildAuthUrl: (...args: unknown[]) => mockBuildAuthUrl(...args),
  }
})

import { GET, GOOGLE_OAUTH_SCOPE_ALLOWLIST } from "./route"
import { OAUTH_STATE_COOKIE } from "@/lib/integrations/google/oauth-state"

const USER = { id: "a0000001-0001-0001-0001-000000000001", email: "u@x.io", role: "sales" }
const DRIVE = "https://www.googleapis.com/auth/drive.readonly"
const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send"

function getRequest(query = ""): NextRequest {
  return new Request(
    `https://crm.nodwin.com/api/integrations/google/authorize${query}`,
  ) as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireUser.mockResolvedValue(USER)
  mockBuildAuthUrl.mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?fake=1")
})

describe("GET /api/integrations/google/authorize", () => {
  it("rejects a scope outside the allowlist with 400 and does not build a consent URL", async () => {
    const res = await GET(getRequest("?scopes=https://www.googleapis.com/auth/drive"))

    expect(res.status).toBe(400)
    expect(mockBuildAuthUrl).not.toHaveBeenCalled()
  })

  it("rejects when one of several scopes is not allowlisted", async () => {
    const res = await GET(
      getRequest(`?scopes=${encodeURIComponent(`${DRIVE} https://evil/scope`)}`),
    )
    expect(res.status).toBe(400)
    expect(mockBuildAuthUrl).not.toHaveBeenCalled()
  })

  it("302-redirects to Google and sets the state nonce cookie for a valid scope", async () => {
    const res = await GET(getRequest(`?scopes=${encodeURIComponent(GMAIL_SEND)}`))

    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toContain("accounts.google.com")
    expect(mockBuildAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: [GMAIL_SEND], state: expect.any(String) }),
    )

    const setCookie = res.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain(`${OAUTH_STATE_COOKIE}=`)
    expect(setCookie.toLowerCase()).toContain("httponly")
  })

  it("falls back to the default scope when none is requested", async () => {
    const res = await GET(getRequest())

    expect(res.status).toBe(302)
    expect(mockBuildAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: [DRIVE] }),
    )
  })

  it("returns 401 when the user is not authenticated", async () => {
    const { UnauthorisedError } = await import("@/lib/security/errors")
    mockRequireUser.mockRejectedValue(new UnauthorisedError("nope"))

    const res = await GET(getRequest(`?scopes=${encodeURIComponent(DRIVE)}`))
    expect(res.status).toBe(401)
    expect(mockBuildAuthUrl).not.toHaveBeenCalled()
  })

  it("keeps the allowlist to the four foundation scopes", () => {
    expect([...GOOGLE_OAUTH_SCOPE_ALLOWLIST].sort()).toEqual(
      [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ].sort(),
    )
  })
})
