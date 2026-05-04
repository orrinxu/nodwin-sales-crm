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
