import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { env } from "@/lib/security/env"
import { verifyPostmarkWebhook } from "@/lib/webhooks/postmark"
import { WebhookVerificationError } from "@/lib/webhooks/verify"
import { processInboundEmail } from "@/lib/email/inbound"

// ORR-690 — mounts the inbound-email pipeline (lib/email/inbound.ts) to a live
// HTTP endpoint. Postmark POSTs an Inbound webhook here; we authenticate it with
// the shared secret (constant-time compare in verifyPostmarkWebhook), then hand
// the parsed payload to processInboundEmail, which runs DKIM/sender/replay/
// account/opportunity resolution and writes an `activities` row (or a deadletter)
// via a service-role client. POSTMARK_WEBHOOK_SECRET is a required env var, so if
// the module boots at all the secret is present — no "unset → 503" branch needed.

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  // Incident kill switch (see docs/runbook-incident.md): lets responders stop
  // inbound-mail DB writes without a redeploy. 503 makes Postmark retry, so mail
  // is paused rather than dropped — it drains once the switch is cleared.
  if (env.INBOUND_EMAIL_DISABLED) {
    return NextResponse.json(
      { error: "Inbound email processing is disabled." },
      { status: 503 },
    )
  }

  // verifyPostmarkWebhook re-parses the JSON from the raw body itself, so we must
  // pass the raw text, not request.json().
  const body = await request.text()

  let payload
  try {
    ;({ payload } = verifyPostmarkWebhook(
      Object.fromEntries(request.headers),
      body,
      env.POSTMARK_WEBHOOK_SECRET,
    ))
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    throw error
  }

  try {
    const result = await processInboundEmail(payload)
    // Every result variant is a *handled* outcome — accepted (activity written),
    // duplicate (replay detected), or deadlettered (durably recorded + admin
    // alerted). Return 200 for all three so Postmark does not retry and duplicate
    // deadletters. Only an unexpected throw below yields a 5xx worth retrying.
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
