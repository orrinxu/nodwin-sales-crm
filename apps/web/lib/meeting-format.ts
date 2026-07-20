// Rendering helpers for calendar-synced meeting activities (ORR-828). Pure, no
// server-only imports — shared by the per-entity, dashboard, and global-feed
// timelines so the three renderers format meeting time ranges and metadata the
// same way. Reads only fields that already exist on ActivityRecord/metadata; the
// data layer and sync engine are out of scope (ORR-826).

import {
  formatPreferenceDate,
  formatPreferenceTime,
  type DateFormatPreference,
} from "@/lib/format"

const EN_DASH = "–"

export interface MeetingTimeParts {
  startsAt: string | null | undefined
  endsAt: string | null | undefined
  timeZone: string | null | undefined
  allDay: boolean | null | undefined
}

/**
 * Human-readable time range for a meeting, honouring the user's date-format
 * preference. The meeting's own `timeZone` wins when present; otherwise the
 * caller's preference zone (`fallbackTimeZone`) is used, and failing that the
 * ambient zone. Returns `null` when there is no usable start time so callers can
 * fall back to their existing display — a manually-created or not-yet-synced
 * meeting may have null times, and we never want to show "Invalid Date".
 */
export function formatMeetingTimeRange(
  meeting: MeetingTimeParts,
  pref: DateFormatPreference | null | undefined,
  fallbackTimeZone?: string | null,
): string | null {
  const { startsAt, endsAt, allDay } = meeting
  if (!startsAt) return null
  const zone = meeting.timeZone ?? fallbackTimeZone ?? undefined

  const startDate = formatPreferenceDate(startsAt, pref, "", zone)
  if (!startDate) return null // unparseable start → let the caller fall back

  if (allDay) {
    // Calendar all-day events use an *exclusive* end date (Google/ICS convention:
    // a single May-7 event is start=May 7, end=May 8). Step back one day to get
    // the inclusive last day so a one-day event reads "· All day", not a range.
    const endMs = endsAt ? new Date(endsAt).getTime() : NaN
    const inclusiveEnd = Number.isNaN(endMs)
      ? null
      : new Date(endMs - 86_400_000)
    const endDate = inclusiveEnd
      ? formatPreferenceDate(inclusiveEnd, pref, "", zone)
      : ""
    if (endDate && endDate !== startDate) {
      return `${startDate} ${EN_DASH} ${endDate}`
    }
    return `${startDate} · All day`
  }

  const startTime = formatPreferenceTime(startsAt, pref, "", zone)
  if (!endsAt) {
    return startTime ? `${startDate} · ${startTime}` : startDate
  }

  const endDate = formatPreferenceDate(endsAt, pref, "", zone)
  const endTime = formatPreferenceTime(endsAt, pref, "", zone)

  if (endDate && endDate !== startDate) {
    // Spans more than one calendar day: label each end explicitly.
    return `${startDate}, ${startTime} ${EN_DASH} ${endDate}, ${endTime}`
  }
  return `${startDate} · ${startTime} ${EN_DASH} ${endTime}`
}

export interface MeetingAttendee {
  email?: string
  displayName?: string
  responseStatus?: string
}

export interface MeetingMetadata {
  location: string | null
  hangoutLink: string | null
  attendees: MeetingAttendee[]
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

/**
 * Typed read of the meeting-specific fields the sync engine writes into an
 * activity's `metadata` jsonb. Static property access only (no dynamic keys), so
 * it doesn't trip `security/detect-object-injection`, and every field is
 * validated before use.
 */
export function readMeetingMetadata(
  metadata: Record<string, unknown> | null | undefined,
): MeetingMetadata {
  const meta = metadata ?? {}
  const rawAttendees = Array.isArray(meta.attendees) ? meta.attendees : []
  const attendees: MeetingAttendee[] = rawAttendees
    .filter(
      (a): a is Record<string, unknown> => typeof a === "object" && a !== null,
    )
    .map((a) => ({
      email: typeof a.email === "string" ? a.email : undefined,
      displayName: typeof a.displayName === "string" ? a.displayName : undefined,
      responseStatus:
        typeof a.responseStatus === "string" ? a.responseStatus : undefined,
    }))
    .filter((a) => a.email || a.displayName)

  return {
    location: nonEmptyString(meta.location),
    hangoutLink: nonEmptyString(meta.hangoutLink),
    attendees,
  }
}

export function attendeeLabel(attendee: MeetingAttendee): string {
  return attendee.displayName ?? attendee.email ?? "Unknown"
}

/**
 * Compact attendee summary: the first `max` names/emails plus a "+K more"
 * suffix. Returns `null` when there are no attendees.
 */
export function summarizeAttendees(
  attendees: MeetingAttendee[],
  max = 3,
): string | null {
  if (attendees.length === 0) return null
  const shown = attendees.slice(0, max).map(attendeeLabel)
  const remaining = attendees.length - shown.length
  return remaining > 0
    ? `${shown.join(", ")} +${remaining} more`
    : shown.join(", ")
}
