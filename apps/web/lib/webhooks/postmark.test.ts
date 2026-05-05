import { describe, it, expect } from "vitest"
import { verifyPostmarkWebhook } from "./postmark"
import { WebhookVerificationError, verifyHmacSignature } from "./verify"

const SECRET = "test-webhook-secret"

function headers(token: string): Record<string, string> {
  return { "x-postmark-webhook-secret": token }
}

const VALID_BODY = JSON.stringify({ MessageID: "abc-123", From: "sender@example.com" })

describe("verifyPostmarkWebhook", () => {
  it("returns parsed payload when token is valid", () => {
    const { payload } = verifyPostmarkWebhook(headers(SECRET), VALID_BODY, SECRET)
    expect(payload).toMatchObject({ MessageID: "abc-123" })
  })

  it("throws WebhookVerificationError when token header is missing", () => {
    expect(() => verifyPostmarkWebhook({}, VALID_BODY, SECRET)).toThrow(WebhookVerificationError)
    expect(() => verifyPostmarkWebhook({}, VALID_BODY, SECRET)).toThrow(/missing/i)
  })

  it("throws WebhookVerificationError when token header is duplicated (string[])", () => {
    expect(() =>
      verifyPostmarkWebhook({ "x-postmark-webhook-secret": ["a", "b"] }, VALID_BODY, SECRET),
    ).toThrow(WebhookVerificationError)
    expect(() =>
      verifyPostmarkWebhook({ "x-postmark-webhook-secret": ["a", "b"] }, VALID_BODY, SECRET),
    ).toThrow(/missing/i)
  })

  it("throws WebhookVerificationError when token header is undefined", () => {
    expect(() =>
      verifyPostmarkWebhook({ "x-postmark-webhook-secret": undefined }, VALID_BODY, SECRET),
    ).toThrow(WebhookVerificationError)
    expect(() =>
      verifyPostmarkWebhook({ "x-postmark-webhook-secret": undefined }, VALID_BODY, SECRET),
    ).toThrow(/missing/i)
  })

  it("throws WebhookVerificationError when token is wrong", () => {
    expect(() =>
      verifyPostmarkWebhook(headers("wrong-token"), VALID_BODY, SECRET),
    ).toThrow(WebhookVerificationError)
  })

  it("throws WebhookVerificationError when body is not valid JSON", () => {
    const malformed = "not json {"
    expect(() => verifyPostmarkWebhook(headers(SECRET), malformed, SECRET)).toThrow(
      WebhookVerificationError,
    )
  })
})

describe("verifyHmacSignature", () => {
  const hmacSecret = "hmac-secret-key"

  it("passes when signature matches (sha256)", () => {
    const payload = '{"event":"test"}'
    const expectedSig = require("node:crypto")
      .createHmac("sha256", hmacSecret)
      .update(payload, "utf8")
      .digest("hex")
    expect(() => verifyHmacSignature(payload, expectedSig, hmacSecret)).not.toThrow()
  })

  it("passes when signature matches (sha1)", () => {
    const payload = '{"event":"test"}'
    const expectedSig = require("node:crypto")
      .createHmac("sha1", hmacSecret)
      .update(payload, "utf8")
      .digest("hex")
    expect(() => verifyHmacSignature(payload, expectedSig, hmacSecret, "sha1")).not.toThrow()
  })

  it("passes when signature matches (sha512)", () => {
    const payload = '{"event":"test"}'
    const expectedSig = require("node:crypto")
      .createHmac("sha512", hmacSecret)
      .update(payload, "utf8")
      .digest("hex")
    expect(() => verifyHmacSignature(payload, expectedSig, hmacSecret, "sha512")).not.toThrow()
  })

  it("throws WebhookVerificationError when signature is missing", () => {
    expect(() =>
      verifyHmacSignature('{"event":"test"}', undefined as unknown as string, hmacSecret),
    ).toThrow(WebhookVerificationError)
    expect(() =>
      verifyHmacSignature('{"event":"test"}', undefined as unknown as string, hmacSecret),
    ).toThrow(/missing/i)
  })

  it("throws WebhookVerificationError on signature mismatch", () => {
    expect(() =>
      verifyHmacSignature('{"event":"test"}', "deadbeef", hmacSecret),
    ).toThrow(WebhookVerificationError)
  })

  it("throws on wrong secret", () => {
    const payload = '{"event":"test"}'
    const sig = require("node:crypto")
      .createHmac("sha256", hmacSecret)
      .update(payload, "utf8")
      .digest("hex")
    expect(() => verifyHmacSignature(payload, sig, "wrong-secret")).toThrow(
      WebhookVerificationError,
    )
  })
})
