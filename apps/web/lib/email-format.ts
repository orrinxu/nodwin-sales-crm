// Rendering helpers for email activities (ORR-834). Pure, no server-only
// imports — shared by the per-entity, dashboard, and global-feed timelines so
// the three renderers surface an email's sender / recipients / attachments the
// same way. Reads only fields that already live on an activity's `metadata`
// jsonb; the ingestion pipelines that write those fields are out of scope.
//
// Two producers write email metadata in DIFFERENT shapes and this reader
// normalizes BOTH:
//   • Postmark inbound (lib/email/inbound.ts) writes `fromName` (a display-name
//     string, no address), `cc` as PostmarkEmailAddress[] ({ Email, Name }), and
//     `attachments` as { name, contentType, contentLength }[]. It writes no `to`.
//   • Gmail (ORR-832) writes `from` as { email, name? }, `to`/`cc` as
//     { email, name? }[], and `attachments` as
//     { filename, mimeType, size, attachmentId }[].
// Every field is optional on both sides — a missing field normalizes to an empty
// value so a partially-populated email never throws or shows "undefined".

export interface EmailPerson {
  name: string | null
  email: string | null
}

export interface EmailAttachmentInfo {
  name: string
  type: string | null
}

export interface EmailMetadata {
  from: EmailPerson | null
  to: EmailPerson[]
  cc: EmailPerson[]
  attachments: EmailAttachmentInfo[]
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/**
 * Normalize a single person entry. Accepts the Gmail shape ({ email, name }),
 * the Postmark shape ({ Email, Name }), or a bare display-name string. Static
 * property access only (no dynamic keys) so it doesn't trip
 * `security/detect-object-injection`. Returns null when neither a name nor an
 * email can be recovered.
 */
function readPerson(value: unknown): EmailPerson | null {
  if (typeof value === "string") {
    const s = value.trim()
    if (!s) return null
    // A bare string is a display name unless it looks like an address.
    return s.includes("@") ? { name: null, email: s } : { name: s, email: null }
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>
    const email = nonEmptyString(obj.email) ?? nonEmptyString(obj.Email)
    const name = nonEmptyString(obj.name) ?? nonEmptyString(obj.Name)
    if (!email && !name) return null
    return { name, email }
  }
  return null
}

function readPeopleArray(value: unknown): EmailPerson[] {
  if (!Array.isArray(value)) return []
  return value
    .map(readPerson)
    .filter((p): p is EmailPerson => p !== null)
}

/**
 * Normalize the attachment list across both producers. Postmark writes
 * `{ name, contentType }`, Gmail writes `{ filename, mimeType }`. An attachment
 * with no recoverable name is dropped (a chip needs a label); `type` may be null.
 */
function readAttachments(value: unknown): EmailAttachmentInfo[] {
  if (!Array.isArray(value)) return []
  const out: EmailAttachmentInfo[] = []
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue
    const obj = item as Record<string, unknown>
    const name = nonEmptyString(obj.name) ?? nonEmptyString(obj.filename)
    if (!name) continue
    const type = nonEmptyString(obj.contentType) ?? nonEmptyString(obj.mimeType)
    out.push({ name, type })
  }
  return out
}

/**
 * Typed read of the email-specific fields the inbound/Gmail pipelines write into
 * an activity's `metadata` jsonb, normalized so callers don't have to know which
 * producer wrote the row. Handles null/undefined metadata and missing fields.
 */
export function readEmailMetadata(
  metadata: Record<string, unknown> | null | undefined,
): EmailMetadata {
  const meta = metadata ?? {}

  // `from`: Gmail's structured object wins; fall back to Postmark's `fromName`
  // display-name string.
  const from = readPerson(meta.from) ?? readPerson(meta.fromName)

  return {
    from,
    to: readPeopleArray(meta.to),
    cc: readPeopleArray(meta.cc),
    attachments: readAttachments(meta.attachments),
  }
}

/** True when there is any sender/recipient/attachment detail worth rendering. */
export function hasEmailDetail(email: EmailMetadata): boolean {
  return (
    email.from != null ||
    email.to.length > 0 ||
    email.cc.length > 0 ||
    email.attachments.length > 0
  )
}

export function emailPersonLabel(person: EmailPerson): string {
  return person.name ?? person.email ?? "Unknown"
}

/**
 * Compact recipient summary: the first `max` labels plus a "+K more" suffix.
 * Returns null when the list is empty. Mirrors `summarizeAttendees` in
 * meeting-format so the two blocks read consistently.
 */
export function summarizeEmailPeople(
  people: EmailPerson[],
  max = 3,
): string | null {
  if (people.length === 0) return null
  const shown = people.slice(0, max).map(emailPersonLabel)
  const remaining = people.length - shown.length
  return remaining > 0
    ? `${shown.join(", ")} +${remaining} more`
    : shown.join(", ")
}
