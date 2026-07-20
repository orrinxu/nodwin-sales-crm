import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/database.types"
import {
  insertEvent,
  CALENDAR_SCOPE,
  type CalendarEventInput,
} from "@/lib/integrations/google/calendar-client"
import { getGoogleConnection } from "@/lib/integrations/google/token-store"
import type { ActivityCallContext, ActivityRecord } from "@/lib/data/activities"

/**
 * Calendar PUSH engine (CRM → Google, ORR-829 / phase 2 of ORR-774).
 *
 * Given a `meeting` activity that was just created in the CRM, best-effort
 * create the matching event on the user's Google Calendar and record its id back
 * on the activity. This is the write counterpart to the pull sync (sync.ts).
 *
 * Echo-loop guard: the created Google event id is written to
 * `activities.external_event_id` and `metadata.source` is set to `'crm'`. The
 * pull sync upserts on `external_event_id` (a partial-unique key), so when this
 * same event later flows back through a pull it upserts onto THIS row rather than
 * creating a duplicate — the CRM meeting and its Google mirror stay one row.
 *
 * It is best-effort by contract: a Google failure (not connected, scope missing,
 * API error) must NEVER lose the already-created CRM meeting. Callers surface a
 * soft warning. It never logs or returns token values.
 */

/** Outcome of a push attempt. `pushed:false` + `reason` = skipped/soft-failed. */
export interface PushMeetingResult {
  pushed: boolean
  externalEventId?: string
  hangoutLink?: string | null
  reason?: string
}

/** Map an activity's stored start/end into a Google event date endpoint. */
function toEventDate(
  value: string,
  timeZone: string | null,
  allDay: boolean,
): CalendarEventInput["start"] {
  if (allDay) {
    // Google all-day events use a bare calendar date (YYYY-MM-DD).
    return { date: value.slice(0, 10) }
  }
  const out: CalendarEventInput["start"] = { dateTime: value }
  if (timeZone) out.timeZone = timeZone
  return out
}

/** Extract `{ email }[]` attendees from the activity metadata, tolerating shapes. */
function attendeesFromMetadata(
  metadata: Record<string, unknown>,
): { email: string }[] {
  const raw = metadata.attendees
  if (!Array.isArray(raw)) return []
  const emails: { email: string }[] = []
  for (const entry of raw) {
    if (typeof entry === "string" && entry.trim()) {
      emails.push({ email: entry.trim() })
    } else if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { email?: unknown }).email === "string" &&
      (entry as { email: string }).email.trim()
    ) {
      emails.push({ email: (entry as { email: string }).email.trim() })
    }
  }
  return emails
}

/**
 * Push a CRM meeting activity to Google Calendar (best-effort).
 *
 * - If the user has no Google connection with the `calendar.events` scope, returns
 *   `{ pushed:false, reason:'not_connected' }` WITHOUT throwing — the meeting is
 *   kept as a CRM-only record.
 * - On success, sets the activity's `external_event_id` and `metadata.source='crm'`
 *   and returns `{ pushed:true, externalEventId }`.
 * - Any Google API / persistence error is surfaced as `{ pushed:false, reason }`
 *   (the caller decides how loudly to warn); it never rethrows.
 */
export async function pushMeetingToGoogle(
  ctx: ActivityCallContext,
  activity: ActivityRecord,
): Promise<PushMeetingResult> {
  // Pre-flight: only push when the user has actively connected Calendar with the
  // events scope. Missing connection is a normal, expected state — not an error.
  const connection = await getGoogleConnection(ctx.user.id)
  if (
    !connection ||
    !connection.connected ||
    !connection.grantedScopes.includes(CALENDAR_SCOPE)
  ) {
    return { pushed: false, reason: "not_connected" }
  }

  if (!activity.startsAt || !activity.endsAt) {
    return { pushed: false, reason: "missing_times" }
  }

  try {
    const event: CalendarEventInput = {
      start: toEventDate(activity.startsAt, activity.timeZone, activity.allDay),
      end: toEventDate(activity.endsAt, activity.timeZone, activity.allDay),
    }
    if (activity.subject) event.summary = activity.subject
    if (activity.body) event.description = activity.body
    const location = activity.metadata.location
    if (typeof location === "string" && location.trim()) {
      event.location = location.trim()
    }
    const attendees = attendeesFromMetadata(activity.metadata)
    if (attendees.length > 0) event.attendees = attendees

    const { eventId, hangoutLink } = await insertEvent({
      userId: ctx.user.id,
      event,
    })

    // Record the Google id + mark the source as CRM-originated. Uses the
    // user-scoped client so RLS confines the write to the caller's own row.
    const supabase = await createServerClient()
    const { error } = await supabase
      .from("activities")
      .update({
        external_event_id: eventId,
        metadata: {
          ...activity.metadata,
          source: "crm",
          ...(hangoutLink ? { hangoutLink } : {}),
        } as unknown as Json,
      })
      .eq("id", activity.id)

    if (error) {
      // The event exists on Google but we couldn't persist its id. Surface as a
      // soft failure — the meeting itself is intact.
      return { pushed: false, reason: `persist_failed: ${error.message}` }
    }

    return { pushed: true, externalEventId: eventId, hangoutLink }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "push_failed"
    return { pushed: false, reason }
  }
}
