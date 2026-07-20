import "server-only"
import { createServerClient } from "@supabase/ssr"
import { env } from "../security/env"
import { sendAdminAlert } from "../notifications/admin-alerts"

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
  // Postmark DKIM verification result field. Possible values: "Pass", "Fail", "None", "SkippedSigning".
  // Note: Postmark sends this as "Dkim" — the acceptance criteria's "DKIMVerified" was a misnomer.
  Dkim: string
  SpfVerdict?: { Status: string }
}

// ---------------------------------------------------------------------------
// Parsed output types (contract consumed by T-010b DB integration)
// ---------------------------------------------------------------------------

export type AttachmentMetadata = {
  name: string
  contentType: string
  contentLength: number
}

export type ParsedInboundEmail = {
  from: string
  fromName: string
  to: PostmarkEmailAddress[]
  cc: PostmarkEmailAddress[]
  subject: string
  textBody: string
  htmlBody: string
  attachments: AttachmentMetadata[]
  inReplyTo: string | null
  messageId: string
  date: string
  /** true iff payload.Dkim === "Pass" — enforcement is T-010b's responsibility */
  dkimVerified: boolean
  /** Extracted from [OPP-{id}] pattern in subject; null when absent */
  opportunityRef: string | null
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseInboundEmail(payload: PostmarkInboundPayload): ParsedInboundEmail {
  return {
    from: payload.FromFull?.Email ? payload.FromFull.Email : extractEmailAddress(payload.From),
    fromName: payload.FromName ?? payload.FromFull?.Name ?? "",
    to: payload.ToFull ?? [],
    cc: payload.CcFull ?? [],
    subject: payload.Subject ?? "",
    textBody: payload.TextBody ?? "",
    htmlBody: payload.HtmlBody ?? "",
    attachments: (payload.Attachments ?? []).map((att) => ({
      name: att.Name,
      contentType: att.ContentType,
      contentLength: att.ContentLength,
    })),
    inReplyTo: getInReplyTo(payload.Headers ?? []),
    messageId: payload.MessageID ?? "",
    date: payload.Date ?? "",
    dkimVerified: payload.Dkim === "Pass",
    opportunityRef: extractOpportunityRef(payload.Subject ?? ""),
  }
}

// ---------------------------------------------------------------------------
// Exported helpers (reused by T-010b)
// ---------------------------------------------------------------------------

export function extractInboundToken(address: string): string | null {
  const lc = address.toLowerCase()
  const suffix = "@crm.nodwin.com"
  if (!lc.endsWith(suffix)) return null
  const local = lc.slice(0, lc.length - suffix.length)
  return local.length > 0 ? local : null
}

export function extractEmailAddress(from: string): string {
  // Handles "Display Name <email@example.com>" and bare "email@example.com"
  const match = from.match(/<([^>]+)>/)
  return match ? match[1].trim() : from.trim()
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getInReplyTo(headers: Array<{ Name: string; Value: string }>): string | null {
  const h = headers.find((h) => h.Name.toLowerCase() === "in-reply-to")
  return h?.Value ?? null
}

function extractOpportunityRef(subject: string): string | null {
  const match = subject.match(/\[OPP-([^\]]+)\]/)
  return match ? match[1] : null
}

// ---------------------------------------------------------------------------
// Pipeline result types
// ---------------------------------------------------------------------------

export type InboundProcessingResult =
  | { status: "accepted"; activityId: string }
  | { status: "deadlettered"; reason: string }
  | { status: "duplicate" }

export type ActivityInsert = {
  accountId: string | null
  opportunityId: string | null
  userId: string
  type: string
  externalThreadId: string
  subject: string
  body: string
  metadata: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024 // 25 MiB
const CRM_DOMAIN = "crm.nodwin.com"

// opportunities.id is a uuid. A subject like `Re: [OPP-1234] pricing` yields a
// non-uuid ref; passing it to `.eq("id", ...)` throws `invalid input syntax for
// type uuid`, which bubbled to a 500 → Postmark retry loop → lost email with no
// deadletter (ORR-811d). Validate the shape first and treat a non-uuid ref as
// "no ref" (normal fallback: attach to account or none).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// Service-role Supabase client (bypasses RLS for webhook handler)
// ---------------------------------------------------------------------------

function createServiceRoleClient() {
  return createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

// ---------------------------------------------------------------------------
// Pipeline: processInboundEmail
// ---------------------------------------------------------------------------

export async function processInboundEmail(
  payload: PostmarkInboundPayload,
): Promise<InboundProcessingResult> {
  const parsed = parseInboundEmail(payload)
  const client = createServiceRoleClient()

  // 1. DKIM enforcement
  if (!parsed.dkimVerified) {
    await writeDeadletter(client, parsed, payload, "DKIM verification failed")
    return { status: "deadlettered", reason: "DKIM verification failed" }
  }

  // 2. Sender verification: From must match a users.crm_inbound_email
  const senderUser = await lookupUserByCrmInboundEmail(client, parsed.from)
  if (!senderUser) {
    await writeDeadletter(client, parsed, payload, "From address does not match any CRM inbound email")
    return { status: "deadlettered", reason: "From address does not match any CRM inbound email" }
  }

  // 3. Replay detection
  const exists = await checkExistingMessageId(client, parsed.messageId)
  if (exists) {
    return { status: "duplicate" }
  }

  // 4. Account matching by recipient domains
  const accountId = await resolveAccountByRecipientDomains(client, parsed.to)

  // 5. Opportunity matching
  let opportunityId: string | null = null
  if (parsed.opportunityRef) {
    opportunityId = await resolveOpportunityByRef(client, parsed.opportunityRef, senderUser.id)
  }

  // 6. Process attachments
  const { keptAttachments, oversizedNames } = filterAttachments(parsed.attachments)

  // 7. Build body — append oversized-attachment notes
  let body = parsed.textBody
  if (oversizedNames.length > 0) {
    const note = `\n\nThe following attachments exceeded the 25 MB limit and were not stored: ${oversizedNames.join(", ")}.`
    body = body + note
  }

  // 8. Insert activity
  const activity = await insertActivity(client, {
    accountId,
    opportunityId,
    userId: senderUser.id,
    type: "email_inbound",
    externalThreadId: parsed.messageId,
    subject: parsed.subject,
    body,
    metadata: {
      fromName: parsed.fromName,
      cc: parsed.cc,
      attachments: keptAttachments,
      attachmentDriveUrls: [],
    },
  })

  return { status: "accepted", activityId: activity.id }
}

// ---------------------------------------------------------------------------
// Sender verification
// ---------------------------------------------------------------------------

type UserLookup = { id: string } | null

async function lookupUserByCrmInboundEmail(
  client: ReturnType<typeof createServiceRoleClient>,
  fromAddress: string,
): Promise<UserLookup> {
  // Lowercase both sides of the comparison: crm_inbound_email is generated as a
  // lowercase hex token (users.sql generate_user_crm_inbound_email), but a mail
  // client may send the From address with mixed case (First.Last@…). Comparing
  // verbatim deadlettered every such email for a working user (ORR-811e).
  const { data, error } = await client
    .from("users")
    .select("id")
    .eq("crm_inbound_email", fromAddress.toLowerCase())
    .maybeSingle()

  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Replay detection
// ---------------------------------------------------------------------------

async function checkExistingMessageId(
  client: ReturnType<typeof createServiceRoleClient>,
  messageId: string,
): Promise<boolean> {
  const { data: activity, error: activityError } = await client
    .from("activities")
    .select("id")
    .eq("external_thread_id", messageId)
    .maybeSingle()

  if (activityError) throw activityError
  if (activity) return true

  const { data: deadletter, error: deadletterError } = await client
    .from("inbound_email_deadletter")
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle()

  if (deadletterError) throw deadletterError
  return deadletter !== null
}

// ---------------------------------------------------------------------------
// Account matching: parse recipient domains, look up accounts.email_domains
// ---------------------------------------------------------------------------

async function resolveAccountByRecipientDomains(
  client: ReturnType<typeof createServiceRoleClient>,
  recipients: PostmarkEmailAddress[],
): Promise<string | null> {
  return resolveAccountByEmailAddresses(
    client,
    recipients.map((r) => r.Email),
  )
}

/**
 * Match exactly one account by the domains of a set of email addresses.
 *
 * Shared single-match logic (extracted from {@link resolveAccountByRecipientDomains}
 * so the Calendar pull sync — ORR-826 — can reuse the identical rule): collect the
 * distinct domains (dropping the CRM's own inbound domain), look up accounts whose
 * `email_domains` overlaps, and return an id ONLY when exactly one account matches.
 * Zero or ambiguous (>1) matches return null so we never mis-attribute.
 */
export async function resolveAccountByEmailAddresses(
  client: ReturnType<typeof createServiceRoleClient>,
  emails: string[],
): Promise<string | null> {
  const domains = new Set<string>()

  for (const email of emails) {
    const domain = extractDomain(email)
    if (domain && domain !== CRM_DOMAIN) {
      domains.add(domain)
    }
  }

  if (domains.size === 0) return null

  const { data, error } = await client
    .from("accounts")
    .select("id")
    .overlaps("email_domains", [...domains])

  if (error) throw error

  if (!data || data.length !== 1) return null

  return data[0].id
}

function extractDomain(email: string): string | null {
  const atIndex = email.lastIndexOf("@")
  if (atIndex === -1) return null
  return email.slice(atIndex + 1).toLowerCase()
}

// ---------------------------------------------------------------------------
// Opportunity matching
// ---------------------------------------------------------------------------

async function resolveOpportunityByRef(
  client: ReturnType<typeof createServiceRoleClient>,
  ref: string,
  userId: string,
): Promise<string | null> {
  // Guard the uuid cast — a malformed [OPP-…] ref must degrade to "no ref", not
  // 500 the webhook (ORR-811d).
  if (!UUID_RE.test(ref)) return null

  const { data: opp, error: oppError } = await client
    .from("opportunities")
    .select("id")
    .eq("id", ref)
    .maybeSingle()

  if (oppError) throw oppError
  if (!opp) return null

  const { data: vis, error: visError } = await client
    .from("opportunity_visibility")
    .select("opportunity_id")
    .eq("opportunity_id", opp.id)
    .eq("user_id", userId)
    .maybeSingle()

  if (visError) throw visError
  if (vis) return opp.id
  return null
}

// ---------------------------------------------------------------------------
// Attachment processing
// ---------------------------------------------------------------------------

type AttachmentFilterResult = {
  keptAttachments: AttachmentMetadata[]
  oversizedNames: string[]
}

function filterAttachments(attachments: AttachmentMetadata[]): AttachmentFilterResult {
  const keptAttachments: AttachmentMetadata[] = []
  const oversizedNames: string[] = []

  for (const att of attachments) {
    if (att.contentLength > MAX_ATTACHMENT_SIZE) {
      oversizedNames.push(att.name)
    } else {
      keptAttachments.push(att)
    }
  }

  return { keptAttachments, oversizedNames }
}

// ---------------------------------------------------------------------------
// Deadletter write + admin alert
// ---------------------------------------------------------------------------

async function writeDeadletter(
  client: ReturnType<typeof createServiceRoleClient>,
  parsed: ParsedInboundEmail,
  payload: PostmarkInboundPayload,
  reason: string,
): Promise<void> {
  const { data: deadletter, error } = await client
    .from("inbound_email_deadletter")
    .insert({
      from_address: parsed.from,
      to_address: payload.OriginalRecipient ?? payload.To ?? "",
      subject: parsed.subject,
      body: parsed.textBody,
      raw_payload: payload as unknown as Record<string, unknown>,
      reason,
      message_id: parsed.messageId,
      alert_sent: false,
    })
    .select("id")
    .single()

  if (error) throw error

  // Send a real admin alert (not console.error).  If the alert fails the
  // deadletter is still persisted; a background poller can retry rows where
  // alert_sent = false.
  try {
    // T-010b: notification channel is the admin_alerts table (not console.error)
    await sendAdminAlert({
      title: "Inbound email deadlettered",
      message: `Email from ${parsed.from} was deadlettered: ${reason}`,
      type: "deadletter",
      metadata: {
        deadletterId: deadletter.id,
        reason,
        fromAddress: parsed.from,
        subject: parsed.subject,
      },
    })

    await client
      .from("inbound_email_deadletter")
      .update({ alert_sent: true })
      .eq("id", deadletter.id)
  } catch (alertError) {
    console.error("Failed to send admin alert for deadletter:", alertError)
  }
}

// ---------------------------------------------------------------------------
// Activity insert
// ---------------------------------------------------------------------------

async function insertActivity(
  client: ReturnType<typeof createServiceRoleClient>,
  params: ActivityInsert,
) {
  const { data, error } = await client
    .from("activities")
    .insert({
      account_id: params.accountId,
      opportunity_id: params.opportunityId,
      user_id: params.userId,
      type: params.type,
      external_thread_id: params.externalThreadId,
      subject: params.subject,
      body: params.body,
      metadata: params.metadata,
    })
    .select("id")
    .single()

  if (error) throw error
  return data
}
