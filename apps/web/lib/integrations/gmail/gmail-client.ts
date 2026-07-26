import "server-only"
import { google, type gmail_v1 } from "googleapis"
import { getValidGoogleAccessToken } from "../google/token-store"

/**
 * Per-user Gmail API client (ORR-775 / ORR-831).
 *
 * This is a PURE client: it obtains a live access token from the token-store
 * (which owns decrypt + auto-refresh + the typed connection errors) and makes
 * authenticated `users.*` calls, returning normalized DTOs. It does NO DB
 * writes, NO auth/session checks, and NO Next.js request wiring — the caller
 * (the sync job / route, ORR-832+) owns persistence and orchestration. Keeping
 * it pure makes it trivially unit-testable and reusable across routes and
 * background jobs, mirroring `google/calendar-client.ts` and `google/verify.ts`.
 *
 * It never logs or returns token values; the only outward data is non-secret
 * message content. Attachments are METADATA ONLY in v1 — no bytes are fetched.
 */

/** The single scope this client requires (read-only mailbox access). */
export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly"

/** The scope required to SEND mail on the user's behalf (ORR-835). */
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"

/**
 * Raised when Gmail rejects a `startHistoryId` with 404 NOT FOUND — the history
 * cursor is too old (Gmail prunes history after ~a week / on large deltas) or
 * otherwise invalid. The caller must drop the stored cursor and perform a full
 * bootstrap (a `users.messages.list` scan). This mirrors the calendar-client's
 * `CalendarSyncTokenExpiredError` (410 on a stale syncToken): the token was
 * accepted by our subsystem but the incremental cursor is stale.
 */
export class GmailHistoryExpiredError extends Error {
  constructor(
    message = "Gmail startHistoryId is invalid or expired (404) — a full bootstrap is required.",
  ) {
    super(message)
    this.name = "GmailHistoryExpiredError"
  }
}

/** A single parsed RFC5322 address (non-secret). */
export interface EmailAddress {
  email: string
  name?: string
}

/**
 * Attachment METADATA only (ORR-831 v1). We surface the `attachmentId` so a
 * future item (ORR-836) can fetch the bytes via `users.messages.attachments.get`
 * — this client never downloads them.
 */
export interface NormalizedEmailAttachment {
  filename: string
  mimeType: string
  size: number
  attachmentId: string
}

/** A normalized, non-secret Gmail message DTO. */
export interface NormalizedEmail {
  externalMessageId: string
  threadId: string | null
  from: EmailAddress | null
  to: EmailAddress[]
  cc: EmailAddress[]
  subject: string | null
  bodyText: string | null
  bodyHtml: string | null
  snippet: string | null
  internalDate: string | null
  labelIds: string[]
  inReplyTo: string | null
  references: string | null
  attachments: NormalizedEmailAttachment[]
}

/** Result of `getProfile` — the bootstrap cursor + mailbox identity. */
export interface GmailProfile {
  emailAddress: string | null
  historyId: string | null
}

/**
 * Build a per-user Gmail v1 client from a live access token. The token-store
 * hands back an already-refreshed token, so we only need a credentialed
 * `OAuth2` shell — no client id / secret / refresh handling here.
 *
 * `google-auth-library` isn't directly resolvable under pnpm, so we type the
 * shell via `InstanceType<typeof google.auth.OAuth2>` (same idiom as
 * calendar-client).
 */
async function gmailClientFor(userId: string): Promise<gmail_v1.Gmail> {
  const accessToken = await getValidGoogleAccessToken(userId, [
    GMAIL_READONLY_SCOPE,
  ])
  const auth: InstanceType<typeof google.auth.OAuth2> =
    new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.gmail({ version: "v1", auth })
}

/** True when a thrown Google API error is a 404 NOT FOUND (stale historyId). */
function isHistoryNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const anyErr = err as { code?: unknown; response?: { status?: unknown } }
  return anyErr.code === 404 || anyErr.response?.status === 404
}

/**
 * Fetch the mailbox profile — used to bootstrap the incremental-sync cursor.
 * `historyId` is the watermark the caller stores; subsequent `listHistory`
 * calls pass it as `startHistoryId`.
 */
export async function getProfile(userId: string): Promise<GmailProfile> {
  const gmail = await gmailClientFor(userId)
  const response = await gmail.users.getProfile({ userId: "me" })
  return {
    emailAddress: response.data.emailAddress ?? null,
    historyId: response.data.historyId ?? null,
  }
}

export interface ListHistoryParams {
  userId: string
  startHistoryId: string
  pageToken?: string
}

export interface ListHistoryResult {
  /** De-duplicated message ids added since `startHistoryId`. */
  addedMessageIds: string[]
  nextPageToken?: string
  /** The mailbox's latest historyId — the caller advances its cursor to this. */
  historyId?: string
}

/**
 * List mailbox changes since `startHistoryId`, returning the ids of messages
 * ADDED in that window (`historyTypes: ['messageAdded']`). The caller then
 * fetches each via {@link getMessage}.
 *
 * @throws GmailHistoryExpiredError  the startHistoryId was rejected with 404
 *   (too old / invalid) — the caller must full-bootstrap via
 *   {@link listMessageIds}.
 * @throws GoogleNotConnectedError / GoogleScopeMissingError / GoogleReauthRequiredError
 *   (propagated unchanged from the token-store).
 */
export async function listHistory(
  params: ListHistoryParams,
): Promise<ListHistoryResult> {
  const { userId, startHistoryId, pageToken } = params
  const gmail = await gmailClientFor(userId)

  let data: gmail_v1.Schema$ListHistoryResponse
  try {
    const response = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      pageToken,
      historyTypes: ["messageAdded"],
    })
    data = response.data
  } catch (err) {
    if (isHistoryNotFound(err)) {
      throw new GmailHistoryExpiredError()
    }
    throw err
  }

  // Collect message ids from every `messagesAdded` entry, de-duplicated while
  // preserving first-seen order (Gmail can repeat an id across history records).
  const seen = new Set<string>()
  const addedMessageIds: string[] = []
  for (const record of data.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      const id = added.message?.id
      if (id && !seen.has(id)) {
        seen.add(id)
        addedMessageIds.push(id)
      }
    }
  }

  const result: ListHistoryResult = { addedMessageIds }
  if (data.nextPageToken) result.nextPageToken = data.nextPageToken
  if (data.historyId) result.historyId = data.historyId
  return result
}

export interface ListMessageIdsParams {
  userId: string
  /** Gmail search query; defaults to the last 30 days for a bounded bootstrap. */
  query?: string
  pageToken?: string
}

export interface ListMessageIdsResult {
  messageIds: string[]
  nextPageToken?: string
}

/**
 * List message ids for a full bootstrap (no history cursor available yet, or the
 * cursor expired). Uses `users.messages.list` with a bounded default query so we
 * never scan the entire mailbox by accident.
 */
export async function listMessageIds(
  params: ListMessageIdsParams,
): Promise<ListMessageIdsResult> {
  const { userId, query = "newer_than:30d", pageToken } = params
  const gmail = await gmailClientFor(userId)

  const response = await gmail.users.messages.list({
    userId: "me",
    q: query,
    pageToken,
  })
  const data = response.data

  const messageIds = (data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id))

  const result: ListMessageIdsResult = { messageIds }
  if (data.nextPageToken) result.nextPageToken = data.nextPageToken
  return result
}

export interface GetMessageParams {
  userId: string
  messageId: string
}

/**
 * Fetch a single message (full format) and normalize its MIME payload into a
 * {@link NormalizedEmail}. Walks the part tree to extract text/html bodies and
 * attachment METADATA (no bytes), and parses the RFC5322 headers.
 */
export async function getMessage(
  params: GetMessageParams,
): Promise<NormalizedEmail> {
  const { userId, messageId } = params
  const gmail = await gmailClientFor(userId)
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  })
  return normalizeMessage(response.data)
}

// ---------------------------------------------------------------------------
// MIME normalization (pure — exported for unit testing)
// ---------------------------------------------------------------------------

/** Case-insensitive lookup of a header value on a MIME part. */
function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string | null {
  const lower = name.toLowerCase()
  const h = (headers ?? []).find((h) => h.name?.toLowerCase() === lower)
  return h?.value ?? null
}

/**
 * Decode a Gmail base64url-encoded body part to a UTF-8 string. Gmail uses the
 * URL-safe alphabet (`-`/`_`) and omits padding; normalize before decoding.
 */
function decodeBody(data: string | null | undefined): string {
  if (!data) return ""
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(b64, "base64").toString("utf-8")
}

/**
 * Parse an RFC5322 address list ("A <a@x.com>, b@y.com") into structured
 * addresses. Tolerant: display names may be quoted; a bare address yields no
 * name. Splits on commas that are not inside quotes or angle brackets.
 */
export function parseAddressList(raw: string | null | undefined): EmailAddress[] {
  if (!raw) return []
  const parts: string[] = []
  let current = ""
  let inQuotes = false
  let inAngle = false
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === "<") inAngle = true
    else if (ch === ">") inAngle = false
    if (ch === "," && !inQuotes && !inAngle) {
      parts.push(current)
      current = ""
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current)

  const out: EmailAddress[] = []
  for (const part of parts) {
    const parsed = parseAddress(part)
    if (parsed) out.push(parsed)
  }
  return out
}

/** Parse a single RFC5322 address into `{ email, name? }`, or null if empty. */
export function parseAddress(raw: string | null | undefined): EmailAddress | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const angle = trimmed.match(/^(.*)<([^>]+)>\s*$/)
  if (angle) {
    const email = angle[2].trim()
    if (!email) return null
    const name = angle[1].trim().replace(/^"(.*)"$/, "$1").trim()
    const addr: EmailAddress = { email }
    if (name) addr.name = name
    return addr
  }

  // Bare address, no display name.
  return { email: trimmed.replace(/^"(.*)"$/, "$1").trim() }
}

interface WalkAccumulator {
  bodyText: string | null
  bodyHtml: string | null
  attachments: NormalizedEmailAttachment[]
}

/**
 * Recursively walk the MIME part tree, accumulating the first text/plain and
 * text/html bodies and every attachment's metadata. An attachment is any part
 * that carries a filename (or an attachmentId in its body).
 */
function walkParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  acc: WalkAccumulator,
): void {
  if (!part) return

  const mimeType = part.mimeType ?? ""
  const filename = part.filename ?? ""
  const attachmentId = part.body?.attachmentId ?? null

  // A named part, or one exposing an attachmentId, is an attachment — capture
  // metadata only (no bytes fetched in v1).
  if (filename || attachmentId) {
    if (attachmentId) {
      acc.attachments.push({
        filename,
        mimeType: mimeType || "application/octet-stream",
        size: part.body?.size ?? 0,
        attachmentId,
      })
    }
  } else if (mimeType === "text/plain") {
    if (acc.bodyText === null) acc.bodyText = decodeBody(part.body?.data)
  } else if (mimeType === "text/html") {
    if (acc.bodyHtml === null) acc.bodyHtml = decodeBody(part.body?.data)
  }

  for (const child of part.parts ?? []) {
    walkParts(child, acc)
  }
}

/**
 * Normalize a raw `gmail_v1.Schema$Message` into a {@link NormalizedEmail}.
 * Handles single-part (body directly on the payload) and multipart (recursive
 * part walk) messages, base64url body decoding, and RFC5322 header extraction.
 */
export function normalizeMessage(
  raw: gmail_v1.Schema$Message,
): NormalizedEmail {
  const payload = raw.payload ?? {}
  const headers = payload.headers ?? undefined

  const acc: WalkAccumulator = {
    bodyText: null,
    bodyHtml: null,
    attachments: [],
  }

  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      walkParts(part, acc)
    }
  } else {
    // Single-part message: the body lives directly on the payload. Route by its
    // own mimeType (text/plain vs text/html).
    const decoded = decodeBody(payload.body?.data)
    if ((payload.mimeType ?? "") === "text/html") {
      acc.bodyHtml = decoded
    } else {
      acc.bodyText = decoded
    }
  }

  return {
    externalMessageId: raw.id ?? "",
    threadId: raw.threadId ?? null,
    from: parseAddress(getHeader(headers, "From")),
    to: parseAddressList(getHeader(headers, "To")),
    cc: parseAddressList(getHeader(headers, "Cc")),
    subject: getHeader(headers, "Subject"),
    bodyText: acc.bodyText,
    bodyHtml: acc.bodyHtml,
    snippet: raw.snippet ?? null,
    internalDate: raw.internalDate ?? null,
    labelIds: raw.labelIds ?? [],
    inReplyTo: getHeader(headers, "In-Reply-To"),
    references: getHeader(headers, "References"),
    attachments: acc.attachments,
  }
}

// ---------------------------------------------------------------------------
// Attachment bytes (ORR-836)
// ---------------------------------------------------------------------------

export interface GetAttachmentBytesParams {
  userId: string
  /** The Gmail message id the attachment belongs to. */
  messageId: string
  /** The `attachmentId` surfaced on {@link NormalizedEmailAttachment}. */
  attachmentId: string
}

/**
 * Fetch a single attachment's raw BYTES via `users.messages.attachments.get`
 * (ORR-836 — v1/ORR-831 recorded metadata only). Gmail returns the payload
 * base64url-encoded (URL-safe alphabet, no padding); we normalize and decode it
 * to a Node `Buffer` for the caller to upload to Storage.
 *
 * Covered by the existing read-only scope. Like the rest of this client it does
 * NO DB writes — the sync job (ORR-836) owns persistence + the size cap.
 */
export async function getAttachmentBytes(
  params: GetAttachmentBytesParams,
): Promise<Buffer> {
  const { userId, messageId, attachmentId } = params
  const gmail = await gmailClientFor(userId)
  const response = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  })
  const data = response.data.data ?? ""
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(b64, "base64")
}

// ---------------------------------------------------------------------------
// SEND (CRM → Gmail, ORR-835) — the write counterpart to the pull above.
//
// Self-contained on purpose: it reuses the shared address type + token-store but
// adds its own scoped client + pure MIME builders so a concurrent edit elsewhere
// in this file (e.g. attachment fetch, ORR-836) rebases without touching it.
// ---------------------------------------------------------------------------

export interface SendMessageParams {
  userId: string
  to: EmailAddress[]
  cc?: EmailAddress[]
  subject: string
  bodyText: string
  /**
   * RFC5322 Message-ID of the message being answered. Emitted as In-Reply-To +
   * References so standards-compliant clients thread the reply.
   */
  inReplyTo?: string
  /** Gmail thread id — keeps the sent message in that existing conversation. */
  threadId?: string
}

export interface SendMessageResult {
  externalMessageId: string
  threadId: string | null
}

/**
 * URL-safe base64 with padding stripped — the alphabet Gmail's `raw` field wants
 * (`+`→`-`, `/`→`_`, no `=`). Accepts a string (encoded UTF-8) or a Buffer.
 */
export function toBase64Url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

/**
 * Format one address as an RFC5322 mailbox: `"Display Name" <email>`, or a bare
 * `email` when there is no name. Embedded quotes/backslashes in the display name
 * are escaped so a name containing a comma or quote can't break header parsing.
 */
export function formatEmailAddress(addr: EmailAddress): string {
  const email = addr.email.trim()
  const name = addr.name?.trim()
  if (!name) return email
  const escaped = name.replace(/([\\"])/g, "\\$1")
  return `"${escaped}" <${email}>`
}

/**
 * RFC2047-encode a header value when it contains non-ASCII, so a subject with
 * accents/emoji survives transport. Pure ASCII passes through untouched.
 */
export function encodeHeaderValue(value: string): string {
  // Non-ASCII if any code unit is above 0x7F.
  const isAscii = ![...value].some((ch) => ch.charCodeAt(0) > 0x7f)
  if (isAscii) return value
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`
}

/**
 * Build an RFC822 MIME message (pure — exported for unit testing). The body is
 * always UTF-8 base64-encoded (folded at 76 chars per RFC2045) so any content is
 * transmitted safely; threading headers are emitted only for a reply.
 */
export function buildRfc822Message(params: {
  to: EmailAddress[]
  cc?: EmailAddress[]
  subject: string
  bodyText: string
  inReplyTo?: string
}): string {
  const { to, cc, subject, bodyText, inReplyTo } = params

  const headers: string[] = []
  headers.push(`To: ${to.map(formatEmailAddress).join(", ")}`)
  if (cc && cc.length > 0) {
    headers.push(`Cc: ${cc.map(formatEmailAddress).join(", ")}`)
  }
  headers.push(`Subject: ${encodeHeaderValue(subject)}`)
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`)
    headers.push(`References: ${inReplyTo}`)
  }
  headers.push("MIME-Version: 1.0")
  headers.push('Content-Type: text/plain; charset="UTF-8"')
  headers.push("Content-Transfer-Encoding: base64")

  const encodedBody = Buffer.from(bodyText, "utf-8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n")

  return `${headers.join("\r\n")}\r\n\r\n${encodedBody}`
}

/** Build a per-user Gmail client scoped for SEND (mirrors {@link gmailClientFor}). */
async function gmailSendClientFor(userId: string): Promise<gmail_v1.Gmail> {
  const accessToken = await getValidGoogleAccessToken(userId, [GMAIL_SEND_SCOPE])
  const auth: InstanceType<typeof google.auth.OAuth2> =
    new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.gmail({ version: "v1", auth })
}

/**
 * Send a plaintext message on the user's behalf (ORR-835). Builds an RFC822 MIME
 * message, base64url-encodes it into the `raw` field, and calls
 * `users.messages.send` (scope `gmail.send`). For a reply, pass `inReplyTo` (the
 * answered message's RFC Message-ID → In-Reply-To/References headers) and/or
 * `threadId` (Gmail attaches the reply to that conversation). Returns the sent
 * message id + thread id. It NEVER logs or returns token values.
 *
 * @throws GoogleNotConnectedError / GoogleScopeMissingError / GoogleReauthRequiredError
 *   (propagated unchanged from the token-store).
 */
export async function sendMessage(
  params: SendMessageParams,
): Promise<SendMessageResult> {
  const { userId, to, cc, subject, bodyText, inReplyTo, threadId } = params
  if (to.length === 0) {
    throw new Error("sendMessage requires at least one recipient.")
  }

  const gmail = await gmailSendClientFor(userId)
  const mime = buildRfc822Message({ to, cc, subject, bodyText, inReplyTo })
  const raw = toBase64Url(mime)

  const requestBody: gmail_v1.Schema$Message = { raw }
  if (threadId) requestBody.threadId = threadId

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody,
  })

  return {
    externalMessageId: response.data.id ?? "",
    threadId: response.data.threadId ?? null,
  }
}
