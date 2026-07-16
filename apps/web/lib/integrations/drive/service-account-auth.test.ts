// @vitest-environment node
// jose signs to a Node Uint8Array; jsdom's realm has a different Uint8Array
// global, so `instanceof` in jose fails under the default jsdom env. This module
// only runs in the Node runtime (route handlers), so the node env matches prod.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { generateKeyPairSync } from "node:crypto"

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {} as Record<string, string | undefined>,
}))
vi.mock("@/lib/security/env", () => ({ env: mockEnv }))

import {
  isDriveConfigured,
  getDriveAccessToken,
  __resetDriveTokenCache,
} from "./service-account-auth"

// A real RSA key so the JWT actually signs (jose importPKCS8 + RS256).
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
})
const validKey = JSON.stringify({ client_email: "sa@proj.iam.gserviceaccount.com", private_key: privateKey })

beforeEach(() => {
  mockEnv.GOOGLE_SERVICE_ACCOUNT_KEY = undefined
  mockEnv.GOOGLE_WORKSPACE_ADMIN_SUBJECT = undefined
  __resetDriveTokenCache()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("service-account-auth (ORR-698)", () => {
  it("isDriveConfigured reflects the presence of the key", () => {
    expect(isDriveConfigured()).toBe(false)
    mockEnv.GOOGLE_SERVICE_ACCOUNT_KEY = validKey
    expect(isDriveConfigured()).toBe(true)
  })

  it("throws a clear error when unconfigured", async () => {
    await expect(getDriveAccessToken()).rejects.toThrow(/not configured/i)
  })

  it("throws on malformed key JSON", async () => {
    mockEnv.GOOGLE_SERVICE_ACCOUNT_KEY = "{not json"
    await expect(getDriveAccessToken()).rejects.toThrow(/not valid JSON/i)
  })

  it("throws when the key is missing required fields", async () => {
    mockEnv.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: "x@y" })
    await expect(getDriveAccessToken()).rejects.toThrow(/missing client_email or private_key/i)
  })

  it("mints and caches an access token via the token endpoint", async () => {
    mockEnv.GOOGLE_SERVICE_ACCOUNT_KEY = validKey
    const fetchMock = vi.fn(async (..._args: unknown[]) => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "ya29.token", expires_in: 3600 }),
      text: async () => "",
    }) as Response)
    vi.stubGlobal("fetch", fetchMock)

    const token = await getDriveAccessToken()
    expect(token).toBe("ya29.token")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token")

    // Second call is served from cache — no new exchange.
    const again = await getDriveAccessToken()
    expect(again).toBe("ya29.token")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
