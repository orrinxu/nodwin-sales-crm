import { describe, it, expect } from "vitest"
import { verifyPostmarkWebhook } from "./postmark"
import { WebhookVerificationError } from "./verify"

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
