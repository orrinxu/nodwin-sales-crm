import "server-only"
import { timingSafeEqual } from "node:crypto"
import { WebhookVerificationError } from "./verify"
import type { PostmarkInboundPayload } from "@/lib/email/inbound"

const TOKEN_HEADER = "x-postmark-webhook-secret"

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const normalizedKey = key.toLowerCase()
  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === normalizedKey) {
      if (typeof value !== "string") {
        return undefined
      }
      return value
    }
  }
  return undefined
}

export function verifyPostmarkWebhook(
  headers: Record<string, string | string[] | undefined>,
  body: string,
  secret: string,
): { payload: PostmarkInboundPayload } {
  const token = getHeaderValue(headers, TOKEN_HEADER)
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
