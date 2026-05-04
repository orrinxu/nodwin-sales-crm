import "server-only"
import { verifyPostmarkWebhook } from "@/lib/webhooks/postmark"
import { WebhookVerificationError } from "@/lib/webhooks/verify"
import { handleInboundEmail, type PostmarkInboundPayload } from "@/lib/email/inbound"
import { createSupabaseInboundDb } from "@/lib/email/inbound-db"

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

    const db = createSupabaseInboundDb()
    const result = await handleInboundEmail(payload as PostmarkInboundPayload, db)

    switch (result.outcome) {
      case "dead_lettered":
        // 202 so Postmark does not retry — we logged the event in the dead-letter table
        return Response.json(
          { ok: false, outcome: result.outcome, reason: result.reason },
          { status: 202 },
        )
      case "replay_dropped":
        return Response.json({ ok: true, outcome: result.outcome }, { status: 202 })
      case "activity_created":
        return Response.json({ ok: true, outcome: result.outcome, activityId: result.activityId })
    }
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return Response.json({ error: error.message }, { status: 401 })
    }
    console.error("[inbound-email] Unexpected error:", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
