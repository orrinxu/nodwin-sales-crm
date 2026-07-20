// @vitest-environment node
// Verifies JWT state via jose, which requires the Node runtime.
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

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

const mockExchangeCode = vi.fn()
vi.mock("@/lib/integrations/google/oauth-client", () => ({
  exchangeCode: (...args: unknown[]) => mockExchangeCode(...args),
}))

vi.mock("@/lib/security/token-crypto", () => ({
  encryptToken: (v: string) => `enc(${v})`,
}))

const mockMaybeSingle = vi.fn()
const mockUpsert = vi.fn()
function makeSupabase() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })),
      })),
      upsert: mockUpsert,
    })),
  }
}
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => makeSupabase()),
}))

import { GET } from "./route"
import { signOAuthState, OAUTH_STATE_COOKIE } from "@/lib/integrations/google/oauth-state"

const USER = { id: "a0000001-0001-0001-0001-000000000001", email: "u@x.io", role: "sales" }
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

function callbackRequest({
  code = "auth-code",
  state,
  error,
  cookieNonce,
}: {
  code?: string | null
  state?: string | null
  error?: string
  cookieNonce?: string
}): NextRequest {
  const url = new URL("https://crm.nodwin.com/api/integrations/google/callback")
  if (error) url.searchParams.set("error", error)
  if (code) url.searchParams.set("code", code)
  if (state) url.searchParams.set("state", state)
  const headers = new Headers()
  if (cookieNonce) headers.set("cookie", `${OAUTH_STATE_COOKIE}=${cookieNonce}`)
  return new NextRequest(url, { headers })
}

function locationOf(res: Response): string {
  return res.headers.get("location") ?? ""
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireUser.mockResolvedValue(USER)
  mockMaybeSingle.mockResolvedValue({ data: null })
  mockUpsert.mockResolvedValue({ error: null })
  mockExchangeCode.mockResolvedValue({
    accessToken: "at",
    refreshToken: "rt",
    expiryDate: 1_800_000_000_000,
    scope: SCOPES.join(" "),
  })
})

describe("GET /api/integrations/google/callback", () => {
  it("redirects to error on a Google error param without exchanging", async () => {
    const res = await GET(callbackRequest({ error: "access_denied" }))
    expect(res.status).toBe(302)
    expect(locationOf(res)).toContain("/settings?google=error")
    expect(mockExchangeCode).not.toHaveBeenCalled()
  })

  it("redirects to error when code or state is missing", async () => {
    const res = await GET(callbackRequest({ code: null, state: "x", cookieNonce: "n" }))
    expect(locationOf(res)).toContain("google=error")
    expect(mockExchangeCode).not.toHaveBeenCalled()
  })

  it("rejects a state minted for a different user", async () => {
    const { state, nonce } = await signOAuthState({ userId: "someone-else", scopes: SCOPES })
    const res = await GET(callbackRequest({ state, cookieNonce: nonce }))
    expect(locationOf(res)).toContain("google=error")
    expect(mockExchangeCode).not.toHaveBeenCalled()
  })

  it("rejects when the double-submit cookie nonce does not match the state", async () => {
    const { state } = await signOAuthState({ userId: USER.id, scopes: SCOPES })
    const res = await GET(callbackRequest({ state, cookieNonce: "wrong-nonce" }))
    expect(locationOf(res)).toContain("google=error")
    expect(mockExchangeCode).not.toHaveBeenCalled()
  })

  it("rejects a tampered state signature", async () => {
    const { state, nonce } = await signOAuthState({ userId: USER.id, scopes: SCOPES })
    const parts = state.split(".")
    parts[1] = parts[1].slice(0, 4) + (parts[1][4] === "X" ? "Y" : "X") + parts[1].slice(5)
    const res = await GET(callbackRequest({ state: parts.join("."), cookieNonce: nonce }))
    expect(locationOf(res)).toContain("google=error")
    expect(mockExchangeCode).not.toHaveBeenCalled()
  })

  it("errors when Google returns no refresh token and none is stored", async () => {
    mockExchangeCode.mockResolvedValue({
      accessToken: "at",
      refreshToken: null,
      expiryDate: null,
      scope: SCOPES.join(" "),
    })
    const { state, nonce } = await signOAuthState({ userId: USER.id, scopes: SCOPES })
    const res = await GET(callbackRequest({ state, cookieNonce: nonce }))
    expect(locationOf(res)).toContain("google=error")
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it("upserts encrypted tokens and redirects to connected on success", async () => {
    const { state, nonce } = await signOAuthState({ userId: USER.id, scopes: SCOPES })
    const res = await GET(callbackRequest({ state, cookieNonce: nonce }))

    expect(res.status).toBe(302)
    expect(locationOf(res)).toContain("/settings?google=connected")

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const [row, opts] = mockUpsert.mock.calls[0]
    expect(opts).toEqual({ onConflict: "user_id" })
    expect(row).toMatchObject({
      user_id: USER.id,
      status: "connected",
      access_token_enc: "enc(at)",
      refresh_token_enc: "enc(rt)",
      granted_scopes: SCOPES,
    })
    // Never persist plaintext tokens.
    expect(JSON.stringify(row)).not.toContain('"at"')
    expect(JSON.stringify(row)).not.toContain('"rt"')
  })

  it("preserves a stored refresh token and merges scopes for incremental auth", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        granted_scopes: ["https://www.googleapis.com/auth/calendar.events"],
        refresh_token_enc: "enc(old-refresh)",
      },
    })
    mockExchangeCode.mockResolvedValue({
      accessToken: "at2",
      refreshToken: null, // Google didn't re-issue one
      expiryDate: null,
      scope: SCOPES.join(" "),
    })
    const { state, nonce } = await signOAuthState({ userId: USER.id, scopes: SCOPES })
    const res = await GET(callbackRequest({ state, cookieNonce: nonce }))

    expect(locationOf(res)).toContain("google=connected")
    const [row] = mockUpsert.mock.calls[0]
    expect(row.refresh_token_enc).toBe("enc(old-refresh)")
    expect(row.granted_scopes.sort()).toEqual(
      [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/drive.readonly",
      ].sort(),
    )
  })
})
