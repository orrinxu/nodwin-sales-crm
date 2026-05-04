import "server-only"

// ---------------------------------------------------------------------------
// Postmark Inbound webhook payload types
// ---------------------------------------------------------------------------

export type PostmarkEmailAddress = {
  Email: string
  Name: string
  MailboxHash: string
}

export type PostmarkAttachment = {
  Name: string
  Content: string
  ContentType: string
  ContentLength: number
  ContentID?: string
}

export type PostmarkInboundPayload = {
  From: string
  FromName: string
  FromFull: PostmarkEmailAddress
  To: string
  ToFull: PostmarkEmailAddress[]
  Cc: string
  CcFull: PostmarkEmailAddress[]
  Bcc: string
  BccFull: PostmarkEmailAddress[]
  OriginalRecipient: string
  Subject: string
  MessageID: string
  Date: string
  TextBody: string
  HtmlBody: string
  ReplyTo: string
  Headers: Array<{ Name: string; Value: string }>
  Attachments: PostmarkAttachment[]
  // Postmark DKIM verification result: "Pass", "Fail", "None", etc.
  Dkim: string
  SpfVerdict?: { Status: string }
}

// ---------------------------------------------------------------------------
// DB adapter interface (injected for testability)
// Schema: T-020 (users), T-021 (accounts), T-026 (activities + deadletter)
// ---------------------------------------------------------------------------

export type InboundEmailUser = {
  id: string
  email: string
  email_aliases: string[]
}

export type InboundEmailAccount = {
  id: string
  name: string
}

export type InboundEmailOpportunity = {
  id: string
  account_id: string | null
}

export type AttachmentMetadata = {
  name: string
  contentType: string
  contentLength: number
  uploadStatus: "pending" | "oversized_skipped"
  note: string
}

export type DeadLetterReason =
  | "dkim_fail"
  | "invalid_inbound_address"
  | "unknown_inbound_token"
  | "sender_mismatch"

export type NewActivity = {
  user_id: string
  account_id: string | null
  opportunity_id: string | null
  subject: string
  text_body: string
  html_body: string
  from_email: string
  message_id: string
  in_reply_to: string | null
  attachment_metadata: AttachmentMetadata[]
  is_assigned: boolean
}

export type NewDeadLetterEntry = {
  raw_payload: PostmarkInboundPayload
  reason: DeadLetterReason
  message_id: string | null
  from_email: string | null
  inbound_token: string | null
}

export type InboundEmailDb = {
  getUserByInboundToken(token: string): Promise<InboundEmailUser | null>
  getAccountsByEmailDomain(domain: string): Promise<InboundEmailAccount[]>
  getOpportunityForUser(
    opportunityId: string,
    userId: string,
  ): Promise<InboundEmailOpportunity | null>
  isMessageIdSeen(messageId: string): Promise<boolean>
  insertActivity(activity: NewActivity): Promise<{ id: string }>
  insertDeadLetter(entry: NewDeadLetterEntry): Promise<void>
  alertAdmin(reason: DeadLetterReason, payload: PostmarkInboundPayload): Promise<void>
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type HandleInboundEmailResult =
  | { outcome: "activity_created"; activityId: string }
  | { outcome: "dead_lettered"; reason: DeadLetterReason }
  | { outcome: "replay_dropped"; messageId: string }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024

const CRM_INBOUND_DOMAIN = "@crm.nodwin.com"

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function handleInboundEmail(
  payload: PostmarkInboundPayload,
  db: InboundEmailDb,
): Promise<HandleInboundEmailResult> {
  // 1. Reject if Postmark DKIM verification did not pass
  if (payload.Dkim !== "Pass") {
    await writeDeadLetter(db, payload, "dkim_fail")
    return { outcome: "dead_lettered", reason: "dkim_fail" }
  }

  // 2. Identify the CRM user from the inbound token address
  const token = extractInboundToken(payload.OriginalRecipient)
  if (!token) {
    await writeDeadLetter(db, payload, "invalid_inbound_address")
    return { outcome: "dead_lettered", reason: "invalid_inbound_address" }
  }

  const user = await db.getUserByInboundToken(token)
  if (!user) {
    await writeDeadLetter(db, payload, "unknown_inbound_token")
    return { outcome: "dead_lettered", reason: "unknown_inbound_token" }
  }

  // 3. Verify sender is the identified user (prevents injection via leaked address)
  const fromEmail = payload.FromFull?.Email
    ? payload.FromFull.Email
    : extractEmailAddress(payload.From)

  if (!isSenderAuthorized(fromEmail, user.email, user.email_aliases)) {
    await writeDeadLetter(db, payload, "sender_mismatch")
    await db.alertAdmin("sender_mismatch", payload)
    return { outcome: "dead_lettered", reason: "sender_mismatch" }
  }

  // 4. Replay protection: drop if we have already processed this message-id
  if (await db.isMessageIdSeen(payload.MessageID)) {
    return { outcome: "replay_dropped", messageId: payload.MessageID }
  }

  // 5. Match an Account by recipient domain (exactly one match required)
  const accountId = await resolveAccount(payload, db)

  // 6. Match an Opportunity by [OPP-id] subject tag (user RLS check applied)
  const opportunityId = await resolveOpportunity(payload.Subject, user.id, db)

  // 7. Collect attachment metadata; flag files exceeding 25 MB
  const attachmentMetadata = processAttachments(payload.Attachments)

  // 8. Create Activity; mark unassigned when neither account nor opportunity was matched
  const activity = await db.insertActivity({
    user_id: user.id,
    account_id: accountId,
    opportunity_id: opportunityId,
    subject: payload.Subject,
    text_body: payload.TextBody,
    html_body: payload.HtmlBody,
    from_email: fromEmail.toLowerCase(),
    message_id: payload.MessageID,
    in_reply_to: getInReplyTo(payload.Headers),
    attachment_metadata: attachmentMetadata,
    is_assigned: accountId !== null || opportunityId !== null,
  })

  return { outcome: "activity_created", activityId: activity.id }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export function extractInboundToken(address: string): string | null {
  const lc = address.toLowerCase()
  if (!lc.endsWith(CRM_INBOUND_DOMAIN)) return null
  const local = lc.slice(0, lc.length - CRM_INBOUND_DOMAIN.length)
  return local.length > 0 ? local : null
}

export function extractEmailAddress(from: string): string {
  // Handles "Display Name <email@example.com>" and bare "email@example.com"
  const match = from.match(/<([^>]+)>/)
  return match ? match[1].trim() : from.trim()
}

export function isSenderAuthorized(
  fromEmail: string,
  userEmail: string,
  aliases: string[],
): boolean {
  const normalized = fromEmail.toLowerCase()
  return (
    normalized === userEmail.toLowerCase() ||
    aliases.some((a) => a.toLowerCase() === normalized)
  )
}

async function resolveAccount(
  payload: PostmarkInboundPayload,
  db: InboundEmailDb,
): Promise<string | null> {
  const allRecipients = [
    ...payload.ToFull,
    ...payload.CcFull,
    ...(payload.BccFull ?? []),
  ]

  // Only consider addresses outside our own inbound domain
  const externalDomains = [
    ...new Set(
      allRecipients
        .map((r) => r.Email.toLowerCase())
        .filter((email) => !email.endsWith(CRM_INBOUND_DOMAIN))
        .map((email) => email.slice(email.indexOf("@") + 1)),
    ),
  ]

  const matchedIds = new Set<string>()
  for (const domain of externalDomains) {
    const accounts = await db.getAccountsByEmailDomain(domain)
    for (const account of accounts) {
      matchedIds.add(account.id)
    }
  }

  // Ambiguous (0 or 2+) → return null so the activity is flagged for manual assignment
  return matchedIds.size === 1 ? [...matchedIds][0] : null
}

async function resolveOpportunity(
  subject: string,
  userId: string,
  db: InboundEmailDb,
): Promise<string | null> {
  const match = subject.match(/\[OPP-([^\]]+)\]/)
  if (!match) return null
  const opportunityId = match[1]
  const opp = await db.getOpportunityForUser(opportunityId, userId)
  return opp?.id ?? null
}

function processAttachments(attachments: PostmarkAttachment[]): AttachmentMetadata[] {
  return attachments.map((att) => {
    if (att.ContentLength > ATTACHMENT_MAX_BYTES) {
      const sizeMb = (att.ContentLength / 1024 / 1024).toFixed(1)
      return {
        name: att.Name,
        contentType: att.ContentType,
        contentLength: att.ContentLength,
        uploadStatus: "oversized_skipped",
        note: `Attachment exceeds 25 MB limit (${sizeMb} MB). Upload skipped.`,
      }
    }
    return {
      name: att.Name,
      contentType: att.ContentType,
      contentLength: att.ContentLength,
      uploadStatus: "pending",
      note: "TODO: upload to matched Drive folder once Drive integration is available (T-081).",
    }
  })
}

function getInReplyTo(headers: Array<{ Name: string; Value: string }>): string | null {
  const h = headers.find((h) => h.Name.toLowerCase() === "in-reply-to")
  return h?.Value ?? null
}

async function writeDeadLetter(
  db: InboundEmailDb,
  payload: PostmarkInboundPayload,
  reason: DeadLetterReason,
): Promise<void> {
  const fromEmail =
    payload.FromFull?.Email
      ? payload.FromFull.Email
      : extractEmailAddress(payload.From)

  await db.insertDeadLetter({
    raw_payload: payload,
    reason,
    message_id: payload.MessageID || null,
    from_email: fromEmail || null,
    inbound_token: extractInboundToken(payload.OriginalRecipient),
  })
}
