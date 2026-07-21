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
