import "server-only"
import { google, type calendar_v3 } from "googleapis"
import { getValidGoogleAccessToken } from "./token-store"

/**
 * Per-user Google Calendar API client (ORR-774 / ORR-825).
 *
 * This is a PURE client: it obtains a live access token from the token-store
 * (which owns decrypt + auto-refresh + the typed connection errors) and makes
 * authenticated `calendar.events.*` calls, returning normalized DTOs. It does NO
 * DB writes, NO auth/session checks, and NO Next.js request wiring — the caller
 * (the sync job / route) owns persistence and orchestration. Keeping it pure
 * makes it trivially unit-testable and reusable across routes and background
 * jobs, mirroring `oauth-client.ts` and `verify.ts`.
 *
 * It never logs or returns token values; the only outward data is non-secret
 * calendar event content.
 */

/** The single scope this client requires (event read + incremental sync). */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"

/**
 * Raised when Google rejects a `syncToken` with 410 GONE — the token is invalid
 * or has expired (Google prunes them after ~a week / on large deltas). The caller
 * must drop the stored token and perform a full resync (a `timeMin` list). This
 * is distinct from the token-store's typed errors (which are about connection
 * state, pre-flight) — here the token was accepted but the sync cursor is stale.
 */
export class CalendarSyncTokenExpiredError extends Error {
  constructor(
    message = "Google Calendar syncToken is invalid or expired (410) — a full resync is required.",
  ) {
    super(message)
    this.name = "CalendarSyncTokenExpiredError"
  }
}

/** A single event date/time endpoint (all-day events use `date`, timed use `dateTime`). */
export interface CalendarEventDate {
  dateTime?: string
  date?: string
  timeZone?: string
}

/** An event attendee (non-secret). */
export interface CalendarAttendee {
  email: string
  displayName?: string
  responseStatus?: string
}

/** A normalized, non-secret Google Calendar event DTO. */
export interface NormalizedCalendarEvent {
  externalEventId: string | null
  iCalUID: string | null
  summary: string | null
  description: string | null
  location: string | null
  hangoutLink: string | null
  start: CalendarEventDate
  end: CalendarEventDate
  allDay: boolean
  status: "confirmed" | "tentative" | "cancelled"
  attendees: CalendarAttendee[]
  organizerEmail: string | null
  updated: string | null
}

/** Map a raw Google event date object to our DTO, dropping absent fields. */
function normalizeDate(raw: calendar_v3.Schema$EventDateTime | undefined): CalendarEventDate {
  const out: CalendarEventDate = {}
  if (raw?.dateTime) out.dateTime = raw.dateTime
  if (raw?.date) out.date = raw.date
  if (raw?.timeZone) out.timeZone = raw.timeZone
  return out
}

/** Extract a video conferencing link, preferring the top-level Hangout link. */
function extractHangoutLink(raw: calendar_v3.Schema$Event): string | null {
  if (raw.hangoutLink) return raw.hangoutLink
  const entry = raw.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video" && Boolean(e.uri),
  )
  return entry?.uri ?? null
}

/** Coerce Google's status string into our closed union, defaulting to confirmed. */
function normalizeStatus(status: string | null | undefined): NormalizedCalendarEvent["status"] {
  if (status === "cancelled" || status === "tentative") return status
  return "confirmed"
}

/**
 * Map a raw `calendar_v3.Schema$Event` into a `NormalizedCalendarEvent`.
 * Tolerates missing / partial fields — cancelled events delivered via a sync
 * token, for example, may carry only `id`, `status`, and `updated`.
 */
export function normalizeEvent(
  raw: calendar_v3.Schema$Event,
): NormalizedCalendarEvent {
  const start = normalizeDate(raw.start ?? undefined)
  const end = normalizeDate(raw.end ?? undefined)

  const attendees: CalendarAttendee[] = (raw.attendees ?? [])
    .filter((a): a is calendar_v3.Schema$EventAttendee & { email: string } =>
      Boolean(a.email),
    )
    .map((a) => {
      const attendee: CalendarAttendee = { email: a.email }
      if (a.displayName) attendee.displayName = a.displayName
      if (a.responseStatus) attendee.responseStatus = a.responseStatus
      return attendee
    })

  return {
    externalEventId: raw.id ?? null,
    iCalUID: raw.iCalUID ?? null,
    summary: raw.summary ?? null,
    description: raw.description ?? null,
    location: raw.location ?? null,
    hangoutLink: extractHangoutLink(raw),
    start,
    end,
    // All-day events carry `start.date` and no `start.dateTime`.
    allDay: Boolean(start.date) || !start.dateTime,
    status: normalizeStatus(raw.status),
    attendees,
    organizerEmail: raw.organizer?.email ?? null,
    updated: raw.updated ?? null,
  }
}

/**
 * Build a per-user Calendar v3 client from a live access token. The token-store
 * hands back an already-refreshed token, so we only need a credentialed
 * `OAuth2` shell — no client id / secret / refresh handling here.
 */
async function calendarClientFor(
  userId: string,
): Promise<calendar_v3.Calendar> {
  const accessToken = await getValidGoogleAccessToken(userId, [CALENDAR_SCOPE])
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.calendar({ version: "v3", auth })
}

/** True when a thrown Google API error is a 410 GONE (stale/invalid syncToken). */
function isSyncTokenGone(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const anyErr = err as { code?: unknown; response?: { status?: unknown } }
  return anyErr.code === 410 || anyErr.response?.status === 410
}

export interface ListEventsParams {
  userId: string
  calendarId?: string
  syncToken?: string
  timeMin?: string
  pageToken?: string
  maxResults?: number
}

export interface ListEventsResult {
  events: NormalizedCalendarEvent[]
  nextSyncToken?: string
  nextPageToken?: string
}

/**
 * List events for a user's calendar, supporting both a full read (`timeMin`) and
 * an incremental delta (`syncToken`).
 *
 * Google requires `syncToken` be MUTUALLY EXCLUSIVE with `timeMin` / `orderBy` /
 * `q`; sending them together is a 400. When a `syncToken` is supplied we send
 * ONLY the sync-safe params; otherwise we send the time-windowed shape.
 *
 * `showDeleted: true` ensures cancellations flow through (as `status:'cancelled'`
 * events); `singleEvents: true` expands recurring events into instances so each
 * carries its own concrete start/end.
 *
 * @throws CalendarSyncTokenExpiredError  the syncToken was rejected with 410.
 * @throws GoogleNotConnectedError / GoogleScopeMissingError / GoogleReauthRequiredError
 *   (propagated unchanged from the token-store).
 */
export async function listEvents(
  params: ListEventsParams,
): Promise<ListEventsResult> {
  const {
    userId,
    calendarId = "primary",
    syncToken,
    timeMin,
    pageToken,
    maxResults = 250,
  } = params

  const calendar = await calendarClientFor(userId)

  const requestParams: calendar_v3.Params$Resource$Events$List = syncToken
    ? {
        calendarId,
        syncToken,
        pageToken,
        maxResults,
        singleEvents: true,
        showDeleted: true,
      }
    : {
        calendarId,
        timeMin,
        pageToken,
        maxResults,
        singleEvents: true,
        showDeleted: true,
        orderBy: "startTime",
      }

  let data: calendar_v3.Schema$Events
  try {
    const response = await calendar.events.list(requestParams)
    data = response.data
  } catch (err) {
    if (isSyncTokenGone(err)) {
      throw new CalendarSyncTokenExpiredError()
    }
    throw err
  }

  const result: ListEventsResult = {
    events: (data.items ?? []).map(normalizeEvent),
  }
  if (data.nextSyncToken) result.nextSyncToken = data.nextSyncToken
  if (data.nextPageToken) result.nextPageToken = data.nextPageToken
  return result
}

export interface GetEventParams {
  userId: string
  calendarId?: string
  eventId: string
}

/** Fetch a single event by id and return it normalized. */
export async function getEvent(
  params: GetEventParams,
): Promise<NormalizedCalendarEvent> {
  const { userId, calendarId = "primary", eventId } = params
  const calendar = await calendarClientFor(userId)
  const response = await calendar.events.get({ calendarId, eventId })
  return normalizeEvent(response.data)
}
