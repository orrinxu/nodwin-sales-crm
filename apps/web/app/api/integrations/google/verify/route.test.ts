// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const mockRequireUser = vi.fn()
vi.mock("@/lib/security/auth", () => ({
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
}))

// Real GoogleApiError so the route's instanceof check is exercised against the
// actual class; only verifyGoogleAccess is replaced with a mock.
const mockVerify = vi.fn()
vi.mock("@/lib/integrations/google/verify", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/google/verify")
  >("@/lib/integrations/google/verify")
  return {
    ...actual,
    verifyGoogleAccess: (...args: unknown[]) => mockVerify(...args),
  }
})

import { GET } from "./route"
import { GoogleApiError } from "@/lib/integrations/google/verify"
import {
  GoogleNotConnectedError,
  GoogleScopeMissingError,
  GoogleReauthRequiredError,
} from "@/lib/integrations/google/token-store"
import { UnauthorisedError } from "@/lib/security/errors"

const USER = { id: "user-1", email: "u@x.io", role: "sales" }

function req(): NextRequest {
  return new Request(
    "https://crm.nodwin.com/api/integrations/google/verify",
  ) as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireUser.mockResolvedValue(USER)
})

describe("GET /api/integrations/google/verify (ORR-822)", () => {
  it("returns 200 with the Google user on success", async () => {
    mockVerify.mockResolvedValue({
      ok: true,
      googleUser: { emailAddress: "u@nodwin.com", displayName: "A User" },
    })

    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(mockVerify).toHaveBeenCalledWith(USER.id)
    await expect(res.json()).resolves.toEqual({
      ok: true,
      googleUser: { emailAddress: "u@nodwin.com", displayName: "A User" },
    })
  })

  it("returns 401 when the user is not authenticated", async () => {
    mockRequireUser.mockRejectedValue(new UnauthorisedError("nope"))

    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(mockVerify).not.toHaveBeenCalled()
    await expect(res.json()).resolves.toMatchObject({ error: "unauthorised" })
  })

  it("returns 409 not_connected", async () => {
    mockVerify.mockRejectedValue(new GoogleNotConnectedError())

    const res = await GET(req())
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ error: "not_connected" })
  })

  it("returns 409 reauth_required", async () => {
    mockVerify.mockRejectedValue(new GoogleReauthRequiredError())

    const res = await GET(req())
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ error: "reauth_required" })
  })

  it("returns 403 with the missing scopes when the scope is not granted", async () => {
    const scope = "https://www.googleapis.com/auth/drive.readonly"
    mockVerify.mockRejectedValue(new GoogleScopeMissingError([scope]))

    const res = await GET(req())
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: "scope_missing",
      missingScopes: [scope],
    })
  })

  it("returns 502 when Google returns a non-2xx (GoogleApiError)", async () => {
    mockVerify.mockRejectedValue(new GoogleApiError(401, "bad token"))

    const res = await GET(req())
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({
      error: "google_api_error",
      upstreamStatus: 401,
    })
  })

  it("returns 500 on an unexpected error", async () => {
    mockVerify.mockRejectedValue(new Error("boom"))

    const res = await GET(req())
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({ error: "internal_error" })
  })
})
