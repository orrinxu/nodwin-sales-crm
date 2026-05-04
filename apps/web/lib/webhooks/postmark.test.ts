import { describe, it, expect } from "vitest"
import { createHmac } from "node:crypto"
import { verifyPostmarkWebhook } from "./postmark"
import { WebhookVerificationError } from "./verify"

const SECRET = "test-webhook-secret"

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("base64")
}

function headers(sig: string): Record<string, string> {
  return { "x-postmark-signature": sig }
}

const VALID_BODY = JSON.stringify({ MessageID: "abc-123", From: "sender@example.com" })

describe("verifyPostmarkWebhook", () => {
  it("returns parsed payload when signature is valid", () => {
    const { payload } = verifyPostmarkWebhook(headers(sign(VALID_BODY)), VALID_BODY, SECRET)
    expect(payload).toMatchObject({ MessageID: "abc-123" })
  })

  it("throws WebhookVerificationError when signature header is missing", () => {
    expect(() => verifyPostmarkWebhook({}, VALID_BODY, SECRET)).toThrow(WebhookVerificationError)
    expect(() => verifyPostmarkWebhook({}, VALID_BODY, SECRET)).toThrow(/missing/i)
  })

  it("throws WebhookVerificationError when body is tampered after signing", () => {
    const sig = sign(VALID_BODY)
    const tampered = VALID_BODY + " tampered"
    expect(() => verifyPostmarkWebhook(headers(sig), tampered, SECRET)).toThrow(
      WebhookVerificationError,
    )
  })

  it("throws WebhookVerificationError when wrong secret is used", () => {
    const sig = sign(VALID_BODY, "wrong-secret")
    expect(() => verifyPostmarkWebhook(headers(sig), VALID_BODY, SECRET)).toThrow(
      WebhookVerificationError,
    )
  })

  it("throws WebhookVerificationError when signature is not valid base64", () => {
    expect(() => verifyPostmarkWebhook(headers("not-valid!!"), VALID_BODY, SECRET)).toThrow(
      WebhookVerificationError,
    )
  })

  it("throws WebhookVerificationError when body is not valid JSON", () => {
    const malformed = "not json {"
    const sig = sign(malformed)
    expect(() => verifyPostmarkWebhook(headers(sig), malformed, SECRET)).toThrow(
      WebhookVerificationError,
    )
  })
})
