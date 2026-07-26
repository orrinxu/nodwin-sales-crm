"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/lib/security/auth"
import {
  createEmailOutboundActivity,
  type ActivityRecord,
} from "@/lib/data/activities"
import { sendMessage } from "@/lib/integrations/gmail/gmail-client"
import {
  GoogleNotConnectedError,
  GoogleScopeMissingError,
  GoogleReauthRequiredError,
} from "@/lib/integrations/google/token-store"

/**
 * Gmail SEND server action (ORR-835). Co-located in its own route-segment module
 * (NOT settings/actions.ts) so it doesn't collide with parallel builds. Sends a
 * plaintext message on the caller's behalf, then records it as an `email_outbound`
 * activity keyed on the sent Gmail message id — the echo-loop guard that keeps a
 * subsequent pull from duplicating the row.
 */

const emailAddressSchema = z.object({
  email: z.string().email(),
  name: z.string().max(200).optional(),
})

const sendEmailSchema = z.object({
  opportunityId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  to: z.array(emailAddressSchema).min(1, "At least one recipient is required."),
  cc: z.array(emailAddressSchema).optional(),
  subject: z.string().max(500).optional().default(""),
  bodyText: z.string().max(50000).optional().default(""),
  /** Gmail thread id to thread a reply into an existing conversation. */
  threadId: z.string().max(1024).optional(),
  /** RFC Message-ID of the message being replied to (In-Reply-To/References). */
  inReplyTo: z.string().max(1024).optional(),
})

/**
 * Discriminated result so the compose UI can distinguish "sent" from the expected
 * "Gmail isn't connected / lacks the send scope" states (prompt to connect) and a
 * genuine failure — without a thrown error tearing down the form.
 */
export interface SendEmailResult {
  sent: boolean
  activity?: ActivityRecord
  reason?: "not_connected" | "scope_missing" | "reauth_required" | "error"
  error?: string
}

export async function createEmailOutboundAction(
  input: unknown,
): Promise<SendEmailResult> {
  const user = await requireUser()
  const parsed = sendEmailSchema.parse(input)
  const ctx = { user, source: "web" as const }

  // 1) SEND via Gmail first — we only log an outbound activity for mail that
  // actually left the building. A missing/insufficient Google connection is an
  // expected state, surfaced as a soft `reason` (not a throw) so the UI can
  // prompt the user to connect Gmail with the send scope.
  let sent
  try {
    sent = await sendMessage({
      userId: user.id,
      to: parsed.to,
      cc: parsed.cc,
      subject: parsed.subject,
      bodyText: parsed.bodyText,
      inReplyTo: parsed.inReplyTo,
      threadId: parsed.threadId,
    })
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return { sent: false, reason: "not_connected" }
    }
    if (err instanceof GoogleScopeMissingError) {
      return { sent: false, reason: "scope_missing" }
    }
    if (err instanceof GoogleReauthRequiredError) {
      return { sent: false, reason: "reauth_required" }
    }
    return {
      sent: false,
      reason: "error",
      error: err instanceof Error ? err.message : "Failed to send the email.",
    }
  }

  // 2) Record the sent message as an email_outbound activity. `external_message_id`
  // = the sent Gmail id and `metadata.source='crm'` are the echo-loop guard: when
  // this message flows back through the pull sync it upserts onto THIS row (ON
  // CONFLICT external_message_id) instead of duplicating.
  const activity = await createEmailOutboundActivity(ctx, {
    opportunityId: parsed.opportunityId ?? null,
    accountId: parsed.accountId ?? null,
    contactId: parsed.contactId ?? null,
    subject: parsed.subject || null,
    body: parsed.bodyText || null,
    externalMessageId: sent.externalMessageId,
    externalThreadId: sent.threadId,
    from: user.email ? { email: user.email } : null,
    to: parsed.to,
    cc: parsed.cc ?? [],
  })

  // Revalidate whichever detail page this was composed from.
  if (parsed.opportunityId) {
    revalidatePath(`/opportunities/${parsed.opportunityId}`)
  }
  if (parsed.accountId) revalidatePath(`/accounts/${parsed.accountId}`)
  if (parsed.contactId) revalidatePath(`/contacts/${parsed.contactId}`)

  return { sent: true, activity }
}
