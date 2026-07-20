import { describe, it, expect, beforeEach, vi } from "vitest"
import { randomBytes } from "node:crypto"

// A valid 32-byte (AES-256) key, base64-encoded, plus a mutable env stand-in so
// individual tests can swap in a missing / malformed key. env is mocked the same
// way the rest of lib/**/*.test.ts stubs it.
const { mockEnv, VALID_KEY_B64 } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes: rb } = require("node:crypto") as typeof import("node:crypto")
  const VALID_KEY_B64 = rb(32).toString("base64")
  return {
    mockEnv: { GOOGLE_TOKEN_ENC_KEY: VALID_KEY_B64 } as Record<string, string | undefined>,
    VALID_KEY_B64,
  }
})

vi.mock("server-only", () => ({}))
vi.mock("@/lib/security/env", () => ({ env: mockEnv }))

import { encryptToken, decryptToken, TokenCryptoError } from "./token-crypto"

describe("token-crypto (AES-256-GCM)", () => {
  beforeEach(() => {
    mockEnv.GOOGLE_TOKEN_ENC_KEY = VALID_KEY_B64
  })

  it("round-trips: decrypt(encrypt(x)) === x", () => {
    const plaintext = "ya29.a0Af_sometoken-with_symbols.123"
    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext)
  })

  it("round-trips an empty string and unicode", () => {
    expect(decryptToken(encryptToken(""))).toBe("")
    expect(decryptToken(encryptToken("🔐 café — токен"))).toBe("🔐 café — токен")
  })

  it("produces different ciphertext for the same input (random IV)", () => {
    const a = encryptToken("same-input")
    const b = encryptToken("same-input")
    expect(a).not.toBe(b)
    // ...but both still decrypt back to the original.
    expect(decryptToken(a)).toBe("same-input")
    expect(decryptToken(b)).toBe("same-input")
  })

  it("throws on a tampered payload (GCM auth-tag mismatch)", () => {
    const payload = encryptToken("secret")
    const blob = Buffer.from(payload, "base64")
    // Flip a bit in the last (ciphertext) byte.
    blob[blob.length - 1] ^= 0x01
    const tampered = blob.toString("base64")
    expect(() => decryptToken(tampered)).toThrow(TokenCryptoError)
  })

  it("throws on a truncated / malformed payload", () => {
    expect(() => decryptToken(randomBytes(4).toString("base64"))).toThrow(TokenCryptoError)
  })

  it("throws a typed error when the key is missing", () => {
    delete mockEnv.GOOGLE_TOKEN_ENC_KEY
    expect(() => encryptToken("x")).toThrow(TokenCryptoError)
  })

  it("throws a typed error when the key is not 32 bytes", () => {
    mockEnv.GOOGLE_TOKEN_ENC_KEY = randomBytes(16).toString("base64")
    expect(() => encryptToken("x")).toThrow(/32 bytes/)
  })
})
