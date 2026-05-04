import "server-only"
import { verifyPostmarkWebhook } from "@/lib/webhooks/postmark"
import { WebhookVerificationError } from "@/lib/webhooks/verify"
import { parseInboundEmail, type PostmarkInboundPayload } from "@/lib/email/inbound"

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.POSTMARK_WEBHOOK_SECRET
    if (!webhookSecret) {
      return Response.json({ error: "POSTMARK_WEBHOOK_SECRET not configured" }, { status: 500 })
    }

    const body = await request.text()
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    // Signature verification (T-009): throws WebhookVerificationError on failure
    const { payload } = verifyPostmarkWebhook(headers, body, webhookSecret)
    const parsed = parseInboundEmail(payload as PostmarkInboundPayload)

    return Response.json({ ok: true, parsed })
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return Response.json({ error: error.message }, { status: 401 })
    }
    console.error("[inbound-email] Unexpected error:", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
