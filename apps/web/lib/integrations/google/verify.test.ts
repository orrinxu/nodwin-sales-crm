// @vitest-environment node
// Runs in the Node runtime (matches route handlers) and uses the global fetch we stub.
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// Mock the token-store's two data accessors but keep its REAL typed error classes,
// so `instanceof` checks (here and in the route) match what verify.ts throws /
// propagates.
const { getConnectionMock, getTokenMock } = vi.hoisted(() => ({
  getConnectionMock: vi.fn(),
  getTokenMock: vi.fn(),
}))
vi.mock("./token-store", async () => {
  const actual = await vi.importActual<typeof import("./token-store")>(
    "./token-store",
  )
  return {
    ...actual,
    getGoogleConnection: getConnectionMock,
    getValidGoogleAccessToken: getTokenMock,
  }
})

import {
  verifyGoogleAccess,
  GoogleApiError,
  VERIFY_SCOPE,
} from "./verify"
import {
  GoogleNotConnectedError,
  GoogleScopeMissingError,
  GoogleReauthRequiredError,
} from "./token-store"

const USER = "user-1"

function connectedConnection(overrides: Record<string, unknown> = {}) {
  return {
    googleAccountEmail: "user@nodwin.com",
    grantedScopes: [VERIFY_SCOPE],
    status: "connected",
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    connected: true,
    ...overrides,
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

describe("verifyGoogleAccess (ORR-822)", () => {
  it("returns the Google user for a valid token", async () => {
    getConnectionMock.mockResolvedValue(connectedConnection())
    getTokenMock.mockResolvedValue("ya29.live-token")
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: { emailAddress: "user@nodwin.com", displayName: "A User" },
      }),
    })

    const result = await verifyGoogleAccess(USER)

    expect(result).toEqual({
      ok: true,
      googleUser: { emailAddress: "user@nodwin.com", displayName: "A User" },
    })
    // Proves it asked for the drive.readonly scope and hit the about endpoint.
    expect(getTokenMock).toHaveBeenCalledWith(USER, [VERIFY_SCOPE])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("/drive/v3/about")
    expect(url).toContain("fields=user")
    expect(init.headers.Authorization).toBe("Bearer ya29.live-token")
  })

  it("defaults googleUser to {} when the response omits user", async () => {
    getConnectionMock.mockResolvedValue(connectedConnection())
    getTokenMock.mockResolvedValue("ya29.live-token")
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    const result = await verifyGoogleAccess(USER)
    expect(result).toEqual({ ok: true, googleUser: {} })
  })

  it("throws GoogleNotConnectedError when there is no connection", async () => {
    getConnectionMock.mockResolvedValue(null)

    await expect(verifyGoogleAccess(USER)).rejects.toBeInstanceOf(
      GoogleNotConnectedError,
    )
    expect(getTokenMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws GoogleNotConnectedError when the connection is not connected", async () => {
    getConnectionMock.mockResolvedValue(
      connectedConnection({ connected: false, status: "revoked" }),
    )

    await expect(verifyGoogleAccess(USER)).rejects.toBeInstanceOf(
      GoogleNotConnectedError,
    )
    expect(getTokenMock).not.toHaveBeenCalled()
  })

  it("propagates GoogleScopeMissingError from the token-store", async () => {
    getConnectionMock.mockResolvedValue(connectedConnection())
    getTokenMock.mockRejectedValue(new GoogleScopeMissingError([VERIFY_SCOPE]))

    await expect(verifyGoogleAccess(USER)).rejects.toBeInstanceOf(
      GoogleScopeMissingError,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("propagates GoogleReauthRequiredError from the token-store", async () => {
    getConnectionMock.mockResolvedValue(connectedConnection())
    getTokenMock.mockRejectedValue(new GoogleReauthRequiredError())

    await expect(verifyGoogleAccess(USER)).rejects.toBeInstanceOf(
      GoogleReauthRequiredError,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws GoogleApiError with the status on a non-200 Google response", async () => {
    getConnectionMock.mockResolvedValue(connectedConnection())
    getTokenMock.mockResolvedValue("ya29.live-token")
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Invalid Credentials",
    })

    const err = await verifyGoogleAccess(USER).catch((e) => e)
    expect(err).toBeInstanceOf(GoogleApiError)
    expect(err.status).toBe(401)
    expect(err.message).toContain("401")
    expect(err.message).toContain("Invalid Credentials")
  })
})
