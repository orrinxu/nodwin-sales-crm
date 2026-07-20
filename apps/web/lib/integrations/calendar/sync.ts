import "server-only"
import { createServerClient as createSsrClient } from "@supabase/ssr"
import { env } from "@/lib/security/env"
import type { Database, Json } from "@/lib/database.types"
import {
  listEvents,
  CalendarSyncTokenExpiredError,
  type NormalizedCalendarEvent,
} from "@/lib/integrations/google/calendar-client"
import { resolveAccountByEmailAddresses } from "@/lib/email/inbound"
import { sendAdminAlert } from "@/lib/notifications/admin-alerts"

/**
 * Google Calendar pull-sync engine (ORR-826 / ORR-774).
 *
 * Pulls a user's Calendar events into CRM `meeting` activities. It is a PURE
 * background job: it builds its own service-role Supabase client (RLS-bypassing,
 * no user session — mirrors token-store's `serviceRoleClient()`), reads the
 * per-user `google_calendar_sync_state`, and drives the pure calendar-client
 * (which owns token refresh + the 410 sync-token error). It NEVER logs token
 * values — the only secret in flight is the access token, which lives inside the
 * calendar-client and never reaches here.
 *
 * Idempotency: each event is upserted on `activities.external_event_id` (a
 * partial-unique key), so re-running a window never duplicates. A `cancelled`
 * event deletes its mirrored activity.
 */

/** Result of a per-user sync pass. `skipped` = disabled/absent, no work done. */
export interface CalendarSyncResult {
  upserted: number
  removed: number
  skipped?: boolean
}

/** Bootstrap window: on a first (token-less) sync, pull the last 30 days. */
const BOOTSTRAP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

type SyncStateRow =
  Database["public"]["Tables"]["google_calendar_sync_state"]["Row"]

/**
 * Service-role Supabase client. Background sync runs with no user session, so it
 * intentionally bypasses RLS — same idiom as token-store.ts / api-tokens.ts.
 */
function serviceRoleClient() {
  return createSsrClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}

type ServiceClient = ReturnType<typeof serviceRoleClient>

interface DrainResult {
  events: NormalizedCalendarEvent[]
  nextSyncToken?: string
}

/**
 * Page through Calendar events until exhausted, accumulating events and the
 * final `nextSyncToken`. With a `syncToken` this is an incremental delta;
 * without one it is a bootstrap read over the last {@link BOOTSTRAP_WINDOW_MS}.
 */
async function drainEvents(
  userId: string,
  calendarId: string,
  syncToken: string | undefined,
): Promise<DrainResult> {
  const events: NormalizedCalendarEvent[] = []
  const timeMin = syncToken
    ? undefined
    : new Date(Date.now() - BOOTSTRAP_WINDOW_MS).toISOString()

  let pageToken: string | undefined
  let nextSyncToken: string | undefined

  do {
    const res = await listEvents({
      userId,
      calendarId,
      syncToken,
      timeMin,
      pageToken,
    })
    events.push(...res.events)
    if (res.nextSyncToken) nextSyncToken = res.nextSyncToken
    pageToken = res.nextPageToken
  } while (pageToken)

  return { events, nextSyncToken }
}

/**
 * Match exactly one contact whose email (case-insensitively) equals one of the
 * attendee emails. Uses `lower(email)` semantics via case-insensitive equality
 * (the `lower(email)` index — ORR-824 — backs this). Returns null on zero or
 * ambiguous (>1) matches so we never mis-attribute.
 */
async function resolveContactByEmails(
  client: ServiceClient,
  emails: string[],
): Promise<string | null> {
  const lowered = [
    ...new Set(
      emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  ]
  if (lowered.length === 0) return null

  // Case-insensitive exact match per email (ilike with no wildcards == equality).
  const orFilter = lowered.map((e) => `email.ilike.${e}`).join(",")

  const { data, error } = await client
    .from("contacts")
    .select("id")
    .or(orFilter)

  if (error) throw error
  if (!data || data.length !== 1) return null
  return data[0].id
}

/** Collect the distinct, non-empty attendee + organizer emails for an event. */
function eventEmails(event: NormalizedCalendarEvent): string[] {
  const emails = event.attendees.map((a) => a.email)
  if (event.organizerEmail) emails.push(event.organizerEmail)
  return emails
}

/** Upsert one event as a `meeting` activity, keyed on `external_event_id`. */
async function upsertMeetingActivity(
  client: ServiceClient,
  userId: string,
  event: NormalizedCalendarEvent,
): Promise<void> {
  const externalEventId = event.externalEventId as string

  const startsAt = event.start.dateTime ?? event.start.date ?? null
  const endsAt = event.end.dateTime ?? event.end.date ?? null
  const timeZone = event.start.timeZone ?? event.end.timeZone ?? null

  const accountId = await resolveAccountByEmailAddresses(
    client,
    eventEmails(event),
  )
  const contactId = await resolveContactByEmails(
    client,
    event.attendees.map((a) => a.email),
  )

  const { error } = await client.from("activities").upsert(
    {
      user_id: userId,
      type: "meeting",
      external_event_id: externalEventId,
      account_id: accountId,
      contact_id: contactId,
      // Opportunity linkage is out of scope for v1 (ORR-826).
      opportunity_id: null,
      starts_at: startsAt,
      ends_at: endsAt,
      time_zone: timeZone,
      all_day: event.allDay,
      subject: event.summary,
      body: event.description,
      metadata: {
        location: event.location,
        hangoutLink: event.hangoutLink,
        attendees: event.attendees,
        organizerEmail: event.organizerEmail,
        source: "calendar",
      } as unknown as Json,
    },
    { onConflict: "external_event_id" },
  )

  if (error) {
    throw new Error(`Failed to upsert calendar activity: ${error.message}`)
  }
}

/** Delete the mirrored activity for a cancelled event, if present. */
async function removeMeetingActivity(
  client: ServiceClient,
  userId: string,
  externalEventId: string,
): Promise<void> {
  const { error } = await client
    .from("activities")
    .delete()
    .eq("external_event_id", externalEventId)
    .eq("user_id", userId)

  if (error) {
    throw new Error(`Failed to remove calendar activity: ${error.message}`)
  }
}

/**
 * Record a dead-letter + admin alert on a sync failure. Reuses the
 * `inbound_email_deadletter` table + admin-alerts channel (the ORR-811 pattern
 * from inbound.ts) so operators have one queue for integration failures. Never
 * includes token values — only the user id and the error message.
 */
async function deadletterSyncFailure(
  client: ServiceClient,
  userId: string,
  reason: string,
): Promise<void> {
  try {
    const { data: deadletter, error } = await client
      .from("inbound_email_deadletter")
      .insert({
        from_address: `calendar-sync:${userId}`,
        to_address: "",
        subject: "Google Calendar sync failure",
        body: reason,
        raw_payload: { source: "calendar", userId } as unknown as Json,
        reason,
        message_id: `calendar-sync:${userId}:${Date.now()}`,
        alert_sent: false,
      })
      .select("id")
      .single()

    if (error) throw error

    try {
      await sendAdminAlert({
        title: "Calendar sync failed",
        message: `Google Calendar sync for user ${userId} failed: ${reason}`,
        type: "error",
        metadata: { deadletterId: deadletter.id, userId, reason },
      })
      await client
        .from("inbound_email_deadletter")
        .update({ alert_sent: true })
        .eq("id", deadletter.id)
    } catch (alertError) {
      console.error("Failed to send admin alert for calendar sync:", alertError)
    }
  } catch (dlError) {
    // Never let dead-lettering mask the original failure.
    console.error("Failed to record calendar sync dead-letter:", dlError)
  }
}

async function setStatus(
  client: ServiceClient,
  userId: string,
  patch: Partial<SyncStateRow>,
): Promise<void> {
  await client
    .from("google_calendar_sync_state")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
}

/**
 * Run a full pull-sync pass for one user. Returns counts of upserted /
 * removed activities; `skipped` when the user has no state row or sync is off.
 */
export async function runCalendarSyncForUser(
  userId: string,
): Promise<CalendarSyncResult> {
  const client = serviceRoleClient()

  const { data: state, error: stateError } = await client
    .from("google_calendar_sync_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (stateError) {
    throw new Error(`Failed to read calendar sync state: ${stateError.message}`)
  }
  if (!state || !state.sync_enabled) {
    return { skipped: true, upserted: 0, removed: 0 }
  }

  const calendarId = state.calendar_id || "primary"

  await setStatus(client, userId, { status: "syncing" })

  try {
    // Incremental if we hold a sync token; on a 410 GONE drop it and do ONE full
    // resync over the bootstrap window.
    let drain: DrainResult
    try {
      drain = await drainEvents(userId, calendarId, state.sync_token ?? undefined)
    } catch (err) {
      if (err instanceof CalendarSyncTokenExpiredError) {
        drain = await drainEvents(userId, calendarId, undefined)
      } else {
        throw err
      }
    }

    let upserted = 0
    let removed = 0

    for (const event of drain.events) {
      // Without an id we cannot key the activity — skip (defensive; the API
      // always supplies ids).
      if (!event.externalEventId) continue

      if (event.status === "cancelled") {
        await removeMeetingActivity(client, userId, event.externalEventId)
        removed += 1
        continue
      }

      await upsertMeetingActivity(client, userId, event)
      upserted += 1
    }

    await setStatus(client, userId, {
      // If Google returned no fresh token (rare), clear it so the next pass
      // bootstraps rather than replaying a stale cursor — idempotent upserts
      // make that safe.
      sync_token: drain.nextSyncToken ?? null,
      last_sync_at: new Date().toISOString(),
      last_error: null,
      status: "idle",
    })

    return { upserted, removed }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Calendar sync failed"
    await setStatus(client, userId, { status: "error", last_error: message })
    await deadletterSyncFailure(client, userId, message)
    throw err
  }
}
