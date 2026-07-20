// @vitest-environment node
// Signs/verifies HS256 JWTs via jose, which requires the Node runtime (matches prod).
import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

const SECRET = "test-jwt-secret-value-at-least-32chars-long"

// NB: the factory is hoisted above the const above, so it must inline the value.
vi.mock("@/lib/security/env", () => ({
  env: { SUPABASE_JWT_SECRET: "test-jwt-secret-value-at-least-32chars-long" },
}))

import {
  signOAuthState,
  verifyOAuthState,
  OAUTH_STATE_COOKIE,
} from "./oauth-state"

const USER = "a0000001-0001-0001-0001-000000000001"
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

describe("oauth-state", () => {
  it("exposes a stable cookie name", () => {
    expect(OAUTH_STATE_COOKIE).toBe("g_oauth_state")
  })

  it("round-trips a signed state (sub, scopes, nonce)", async () => {
    const { state, nonce } = await signOAuthState({ userId: USER, scopes: SCOPES })
    const payload = await verifyOAuthState(state)

    expect(payload.sub).toBe(USER)
    expect(payload.scopes).toEqual(SCOPES)
    expect(payload.nonce).toBe(nonce)
    expect(nonce).toMatch(/[0-9a-f-]{36}/)
  })

  it("uses a fresh random nonce per call", async () => {
    const a = await signOAuthState({ userId: USER, scopes: SCOPES })
    const b = await signOAuthState({ userId: USER, scopes: SCOPES })
    expect(a.nonce).not.toBe(b.nonce)
  })

  it("rejects a tampered token", async () => {
    const { state } = await signOAuthState({ userId: USER, scopes: SCOPES })
    // Corrupt a byte in the payload segment so the signature no longer matches.
    const parts = state.split(".")
    parts[1] = parts[1].slice(0, 4) + (parts[1][4] === "X" ? "Y" : "X") + parts[1].slice(5)
    await expect(verifyOAuthState(parts.join("."))).rejects.toThrow()
  })

  it("rejects a token signed with a different secret", async () => {
    const { SignJWT } = await import("jose")
    const foreign = await new SignJWT({ nonce: "n", scopes: SCOPES })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(USER)
      .setAudience("google-oauth-state")
      .setIssuedAt()
      .setExpirationTime("600s")
      .sign(new TextEncoder().encode("a-totally-different-secret-value-32b!!"))

    await expect(verifyOAuthState(foreign)).rejects.toThrow()
  })

  it("rejects an expired token", async () => {
    const { SignJWT } = await import("jose")
    const expired = await new SignJWT({ nonce: "n", scopes: SCOPES })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(USER)
      .setAudience("google-oauth-state")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(SECRET))

    await expect(verifyOAuthState(expired)).rejects.toThrow()
  })

  it("rejects a token with a mismatched audience", async () => {
    const { SignJWT } = await import("jose")
    const wrongAud = await new SignJWT({ nonce: "n", scopes: SCOPES })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(USER)
      .setAudience("some-other-audience")
      .setIssuedAt()
      .setExpirationTime("600s")
      .sign(new TextEncoder().encode(SECRET))

    await expect(verifyOAuthState(wrongAud)).rejects.toThrow()
  })

  it("rejects a well-signed token with a malformed payload", async () => {
    const { SignJWT } = await import("jose")
    const malformed = await new SignJWT({ nonce: 123, scopes: "not-an-array" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(USER)
      .setAudience("google-oauth-state")
      .setIssuedAt()
      .setExpirationTime("600s")
      .sign(new TextEncoder().encode(SECRET))

    await expect(verifyOAuthState(malformed)).rejects.toThrow(/malformed/i)
  })
})
