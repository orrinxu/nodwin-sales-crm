import "server-only"
import { timingSafeEqual } from "node:crypto"
import { WebhookVerificationError } from "./verify"
import type { PostmarkInboundPayload } from "@/lib/email/inbound"

const TOKEN_HEADER = "x-postmark-webhook-secret"

export function verifyPostmarkWebhook(
  headers: Record<string, string>,
  body: string,
  secret: string,
): { payload: PostmarkInboundPayload } {
  const token = headers[TOKEN_HEADER]
  if (!token) {
    throw new WebhookVerificationError(`Missing ${TOKEN_HEADER} header`)
  }

  const secretBuf = Buffer.from(secret, "utf8")
  const tokenBuf = Buffer.from(token, "utf8")

  if (secretBuf.length !== tokenBuf.length || !timingSafeEqual(secretBuf, tokenBuf)) {
    throw new WebhookVerificationError("Postmark webhook token mismatch")
  }

  let payload: PostmarkInboundPayload
  try {
    payload = JSON.parse(body) as PostmarkInboundPayload
  } catch {
    throw new WebhookVerificationError("Webhook body is not valid JSON")
  }

  return { payload }
}
