// @vitest-environment node
// This module only runs in the Node runtime (route handlers / jobs), matching prod.
import { describe, it, expect, vi, beforeEach } from "vitest"

// Shared env mock (same pattern as service-account-auth.test.ts) so we can toggle
// configured / unconfigured per test without touching the real process.env.
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {} as Record<string, string | undefined>,
}))
vi.mock("@/lib/security/env", () => ({ env: mockEnv }))

// Mock googleapis so nothing hits the network. The mocked OAuth2 constructor
// records its args and provides generateAuthUrl / getToken / setCredentials /
// refreshAccessToken. generateAuthUrl builds a real URL from the options so the
// URL assertions are meaningful (mirrors the real library's behaviour).
const { getTokenMock, refreshMock, setCredentialsMock, oauth2Ctor } = vi.hoisted(
  () => {
    const getTokenMock = vi.fn()
    const refreshMock = vi.fn()
    const setCredentialsMock = vi.fn()
    const oauth2Ctor = vi.fn(
      (clientId?: string, clientSecret?: string, redirectUri?: string) => ({
        clientId,
        clientSecret,
        redirectUri,
        generateAuthUrl(opts: Record<string, unknown>) {
          const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
          for (const [key, value] of Object.entries(opts)) {
            if (value === undefined) continue
            url.searchParams.set(
              key,
              Array.isArray(value) ? value.join(" ") : String(value),
            )
          }
          return url.toString()
        },
        getToken: getTokenMock,
        setCredentials: setCredentialsMock,
        refreshAccessToken: refreshMock,
      }),
    )
    return { getTokenMock, refreshMock, setCredentialsMock, oauth2Ctor }
  },
)
vi.mock("googleapis", () => ({
  google: { auth: { OAuth2: oauth2Ctor } },
}))

import {
  getOAuth2Client,
  buildAuthUrl,
  exchangeCode,
  refreshAccessToken,
  GoogleOAuthNotConfiguredError,
} from "./oauth-client"

function configure() {
  mockEnv.GOOGLE_OAUTH_CLIENT_ID = "client-123.apps.googleusercontent.com"
  mockEnv.GOOGLE_OAUTH_CLIENT_SECRET = "secret-abc"
  mockEnv.GOOGLE_OAUTH_REDIRECT_URI =
    "http://localhost:3000/api/integrations/google/callback"
}

beforeEach(() => {
  mockEnv.GOOGLE_OAUTH_CLIENT_ID = undefined
  mockEnv.GOOGLE_OAUTH_CLIENT_SECRET = undefined
  mockEnv.GOOGLE_OAUTH_REDIRECT_URI = undefined
  getTokenMock.mockReset()
  refreshMock.mockReset()
  setCredentialsMock.mockReset()
  oauth2Ctor.mockClear()
})

describe("getOAuth2Client (ORR-818)", () => {
  it("throws GoogleOAuthNotConfiguredError when all env vars are absent", () => {
    expect(() => getOAuth2Client()).toThrow(GoogleOAuthNotConfiguredError)
  })

  it("names every missing var in the error message", () => {
    mockEnv.GOOGLE_OAUTH_CLIENT_ID = "client-123"
    expect(() => getOAuth2Client()).toThrow(
      /GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI/,
    )
  })

  it("builds the client from the three env vars when configured", () => {
    configure()
    getOAuth2Client()
    expect(oauth2Ctor).toHaveBeenCalledWith(
      "client-123.apps.googleusercontent.com",
      "secret-abc",
      "http://localhost:3000/api/integrations/google/callback",
    )
  })
})

describe("buildAuthUrl (ORR-818)", () => {
  it("emits a consent URL with the expected offline / incremental params, scope and state", () => {
    configure()
    const scopes = [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/gmail.send",
    ]
    const state = "user:42:nonce-xyz"

    const url = new URL(buildAuthUrl({ scopes, state }))

    expect(url.searchParams.get("access_type")).toBe("offline")
    expect(url.searchParams.get("include_granted_scopes")).toBe("true")
    expect(url.searchParams.get("prompt")).toBe("consent")
    expect(url.searchParams.get("scope")).toBe(scopes.join(" "))
    expect(url.searchParams.get("state")).toBe(state)
  })

  it("throws when unconfigured (pure — no network)", () => {
    expect(() => buildAuthUrl({ scopes: ["x"], state: "s" })).toThrow(
      GoogleOAuthNotConfiguredError,
    )
  })
})

describe("exchangeCode (ORR-818)", () => {
  it("maps the token response into the typed result", async () => {
    configure()
    getTokenMock.mockResolvedValue({
      tokens: {
        access_token: "ya29.access",
        refresh_token: "1//refresh",
        expiry_date: 1_700_000_000_000,
        scope: "https://www.googleapis.com/auth/gmail.send",
      },
    })

    const result = await exchangeCode("auth-code")

    expect(getTokenMock).toHaveBeenCalledWith("auth-code")
    expect(result).toEqual({
      accessToken: "ya29.access",
      refreshToken: "1//refresh",
      expiryDate: 1_700_000_000_000,
      scope: "https://www.googleapis.com/auth/gmail.send",
    })
  })

  it("nulls fields absent from the response", async () => {
    configure()
    getTokenMock.mockResolvedValue({ tokens: { access_token: "ya29.access" } })

    const result = await exchangeCode("auth-code")

    expect(result).toEqual({
      accessToken: "ya29.access",
      refreshToken: null,
      expiryDate: null,
      scope: null,
    })
  })
})

describe("refreshAccessToken (ORR-818)", () => {
  it("sets the refresh token, refreshes, and returns the new access token", async () => {
    configure()
    refreshMock.mockResolvedValue({
      credentials: { access_token: "ya29.fresh", expiry_date: 1_700_000_123_000 },
    })

    const result = await refreshAccessToken("1//refresh")

    expect(setCredentialsMock).toHaveBeenCalledWith({ refresh_token: "1//refresh" })
    expect(result).toEqual({
      accessToken: "ya29.fresh",
      expiryDate: 1_700_000_123_000,
    })
  })
})
