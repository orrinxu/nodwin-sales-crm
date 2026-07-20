// @vitest-environment node
// Runs in the Node runtime (matches route handlers / jobs, and node:crypto usage).
import { describe, it, expect, vi, beforeEach } from "vitest"

// --- env mock: only the two service-role vars matter here. ---
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  } as Record<string, string | undefined>,
}))
vi.mock("@/lib/security/env", () => ({ env: mockEnv }))

// --- token-crypto mock: reversible, deterministic, no real key needed. ---
vi.mock("@/lib/security/token-crypto", () => ({
  encryptToken: vi.fn((plaintext: string) => `enc:${plaintext}`),
  decryptToken: vi.fn((payload: string) => payload.replace(/^enc:/, "")),
}))

// --- oauth-client mock: no network. ---
const { refreshMock, revokeMock, oauth2ClientMock } = vi.hoisted(() => {
  const refreshMock = vi.fn()
  const revokeMock = vi.fn()
  const oauth2ClientMock = { revokeToken: revokeMock }
  return { refreshMock, revokeMock, oauth2ClientMock }
})
vi.mock("./oauth-client", () => ({
  refreshAccessToken: refreshMock,
  getOAuth2Client: vi.fn(() => oauth2ClientMock),
}))

// --- Supabase service-role client mock. A shared `dbState` drives what the
// query builder reads back and records what it writes. Each `.from()` yields a
// fresh builder so per-chain operation state never leaks between calls. ---
const { dbState } = vi.hoisted(() => ({
  dbState: {
    row: null as Record<string, unknown> | null,
    updates: [] as Record<string, unknown>[],
    deleteCalled: false,
    readError: null as { message: string } | null,
    writeError: null as { message: string } | null,
  },
}))

function makeBuilder() {
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: () => builder,
    update: (vals: Record<string, unknown>) => {
      dbState.updates.push(vals)
      return builder
    },
    delete: () => {
      dbState.deleteCalled = true
      return builder
    },
    eq: () => builder,
    maybeSingle: () =>
      Promise.resolve({ data: dbState.row, error: dbState.readError }),
    // Terminal for update/delete chains: awaiting the builder resolves here.
    then: (
      resolve: (v: { error: unknown }) => unknown,
      reject: (e: unknown) => unknown,
    ) => Promise.resolve({ error: dbState.writeError }).then(resolve, reject),
  })
  return builder
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ from: () => makeBuilder() })),
}))

import {
  getGoogleConnection,
  getValidGoogleAccessToken,
  disconnectGoogle,
  GoogleNotConnectedError,
  GoogleScopeMissingError,
  GoogleReauthRequiredError,
} from "./token-store"
import { encryptToken } from "@/lib/security/token-crypto"

const SCOPE_CAL = "https://www.googleapis.com/auth/calendar.events"
const SCOPE_GMAIL = "https://www.googleapis.com/auth/gmail.send"

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    user_id: "user-1",
    google_account_email: "user@nodwin.com",
    access_token_enc: "enc:access-old",
    refresh_token_enc: "enc:refresh-1",
    access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    granted_scopes: [SCOPE_CAL, SCOPE_GMAIL],
    status: "connected",
    connected_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  dbState.row = null
  dbState.updates = []
  dbState.deleteCalled = false
  dbState.readError = null
  dbState.writeError = null
  refreshMock.mockReset()
  revokeMock.mockReset()
})

describe("getGoogleConnection", () => {
  it("returns null when there is no row", async () => {
    dbState.row = null
    expect(await getGoogleConnection("user-1")).toBeNull()
  })

  it("returns the non-secret DTO (no tokens) with connected=true when status=connected", async () => {
    dbState.row = baseRow()
    const info = await getGoogleConnection("user-1")
    expect(info).toEqual({
      googleAccountEmail: "user@nodwin.com",
      grantedScopes: [SCOPE_CAL, SCOPE_GMAIL],
      status: "connected",
      accessTokenExpiresAt: dbState.row!.access_token_expires_at,
      connected: true,
    })
    // Never leak token material.
    expect(JSON.stringify(info)).not.toContain("access-old")
    expect(JSON.stringify(info)).not.toContain("refresh-1")
  })

  it("marks connected=false for a non-connected status", async () => {
    dbState.row = baseRow({ status: "expired" })
    const info = await getGoogleConnection("user-1")
    expect(info?.connected).toBe(false)
  })
})

describe("getValidGoogleAccessToken", () => {
  it("returns the decrypted token WITHOUT refreshing when it is valid and unexpired", async () => {
    dbState.row = baseRow({ access_token_enc: "enc:access-valid" })
    const token = await getValidGoogleAccessToken("user-1", [SCOPE_CAL])
    expect(token).toBe("access-valid")
    expect(refreshMock).not.toHaveBeenCalled()
    expect(dbState.updates).toHaveLength(0)
  })

  it("throws GoogleNotConnectedError when there is no row", async () => {
    dbState.row = null
    await expect(getValidGoogleAccessToken("user-1", [SCOPE_CAL])).rejects.toBeInstanceOf(
      GoogleNotConnectedError,
    )
  })

  it("throws GoogleNotConnectedError when the row status is 'revoked'", async () => {
    dbState.row = baseRow({ status: "revoked" })
    await expect(getValidGoogleAccessToken("user-1", [SCOPE_CAL])).rejects.toBeInstanceOf(
      GoogleNotConnectedError,
    )
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it("throws GoogleScopeMissingError carrying the missing scopes", async () => {
    dbState.row = baseRow({ granted_scopes: [SCOPE_CAL] })
    const err = await getValidGoogleAccessToken("user-1", [
      SCOPE_CAL,
      SCOPE_GMAIL,
    ]).catch((e) => e)
    expect(err).toBeInstanceOf(GoogleScopeMissingError)
    expect((err as GoogleScopeMissingError).missingScopes).toEqual([SCOPE_GMAIL])
  })

  it("refreshes an expired token, persists the fresh token, and returns it", async () => {
    dbState.row = baseRow({
      access_token_enc: "enc:access-old",
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
    })
    const newExpiry = Date.now() + 3_600_000
    refreshMock.mockResolvedValue({
      accessToken: "fresh-access",
      expiryDate: newExpiry,
    })

    const token = await getValidGoogleAccessToken("user-1", [SCOPE_CAL])

    expect(token).toBe("fresh-access")
    expect(refreshMock).toHaveBeenCalledWith("refresh-1") // decrypted refresh token
    expect(encryptToken).toHaveBeenCalledWith("fresh-access")
    expect(dbState.updates).toHaveLength(1)
    expect(dbState.updates[0]).toMatchObject({
      access_token_enc: "enc:fresh-access",
      access_token_expires_at: new Date(newExpiry).toISOString(),
      status: "connected",
    })
  })

  it("refreshes when access_token_expires_at is null", async () => {
    dbState.row = baseRow({ access_token_expires_at: null })
    refreshMock.mockResolvedValue({ accessToken: "fresh-access", expiryDate: null })
    const token = await getValidGoogleAccessToken("user-1", [SCOPE_CAL])
    expect(token).toBe("fresh-access")
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it("on invalid_grant refresh failure sets status='revoked' and throws GoogleReauthRequiredError", async () => {
    dbState.row = baseRow({
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
    })
    refreshMock.mockRejectedValue(
      Object.assign(new Error("invalid_grant"), {
        response: { data: { error: "invalid_grant" } },
      }),
    )

    await expect(
      getValidGoogleAccessToken("user-1", [SCOPE_CAL]),
    ).rejects.toBeInstanceOf(GoogleReauthRequiredError)

    // The connection was marked revoked.
    expect(dbState.updates).toHaveLength(1)
    expect(dbState.updates[0]).toMatchObject({ status: "revoked" })
  })

  it("throws GoogleReauthRequiredError when there is no stored refresh token", async () => {
    dbState.row = baseRow({
      refresh_token_enc: null,
      access_token_expires_at: null,
    })
    await expect(
      getValidGoogleAccessToken("user-1", [SCOPE_CAL]),
    ).rejects.toBeInstanceOf(GoogleReauthRequiredError)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it("single-flights concurrent refreshes into one refresh + one write", async () => {
    dbState.row = baseRow({
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
    })
    refreshMock.mockResolvedValue({
      accessToken: "fresh-access",
      expiryDate: Date.now() + 3_600_000,
    })

    const [a, b] = await Promise.all([
      getValidGoogleAccessToken("user-1", [SCOPE_CAL]),
      getValidGoogleAccessToken("user-1", [SCOPE_CAL]),
    ])

    expect(a).toBe("fresh-access")
    expect(b).toBe("fresh-access")
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(dbState.updates).toHaveLength(1)
  })
})

describe("disconnectGoogle", () => {
  it("does nothing when there is no row", async () => {
    dbState.row = null
    await disconnectGoogle("user-1")
    expect(revokeMock).not.toHaveBeenCalled()
    expect(dbState.deleteCalled).toBe(false)
  })

  it("best-effort revokes the refresh token then deletes the row", async () => {
    dbState.row = baseRow()
    revokeMock.mockResolvedValue(undefined)
    await disconnectGoogle("user-1")
    expect(revokeMock).toHaveBeenCalledWith("refresh-1")
    expect(dbState.deleteCalled).toBe(true)
  })

  it("deletes the row even when the remote revoke throws", async () => {
    dbState.row = baseRow()
    revokeMock.mockRejectedValue(new Error("already revoked"))
    await disconnectGoogle("user-1")
    expect(dbState.deleteCalled).toBe(true)
  })
})
