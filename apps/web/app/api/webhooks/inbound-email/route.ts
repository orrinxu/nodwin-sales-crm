import "server-only"
import { verifyPostmarkWebhook } from "@/lib/webhooks/postmark"
import { WebhookVerificationError } from "@/lib/webhooks/verify"
import { handleInboundEmail, type PostmarkInboundPayload } from "@/lib/email/inbound"
import { createSupabaseInboundDb } from "@/lib/email/inbound-db"
import { env } from "@/lib/security/env"

export async function POST(request: Request) {
  try {
    const webhookSecret = env.POSTMARK_WEBHOOK_SECRET

    const body = await request.text()
    const headers = Object.fromEntries(request.headers.entries())

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
