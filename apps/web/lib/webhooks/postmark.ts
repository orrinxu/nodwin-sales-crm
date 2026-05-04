import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import { WebhookVerificationError } from "./verify"
import type { PostmarkInboundPayload } from "@/lib/email/inbound"

// Postmark sends the HMAC-SHA256 signature of the raw body in this header.
const SIG_HEADER = "x-postmark-signature"

export function verifyPostmarkWebhook(
  headers: Record<string, string>,
  body: string,
  secret: string,
): { payload: PostmarkInboundPayload } {
  const signature = headers[SIG_HEADER]
  if (!signature) {
    throw new WebhookVerificationError("Missing x-postmark-signature header")
  }

  const expected = createHmac("sha256", secret).update(body).digest("base64")
  const sigBuf = Buffer.from(signature, "base64")
  const expBuf = Buffer.from(expected, "base64")

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new WebhookVerificationError("Postmark webhook signature mismatch")
  }

  let payload: PostmarkInboundPayload
  try {
    payload = JSON.parse(body) as PostmarkInboundPayload
  } catch {
    throw new WebhookVerificationError("Webhook body is not valid JSON")
  }

  return { payload }
}
