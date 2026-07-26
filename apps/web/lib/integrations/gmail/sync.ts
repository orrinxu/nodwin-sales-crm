import "server-only"
import { createServerClient as createSsrClient } from "@supabase/ssr"
import { env } from "@/lib/security/env"
import type { Database, Json } from "@/lib/database.types"
import {
  getProfile,
  listHistory,
  listMessageIds,
  getMessage,
  GmailHistoryExpiredError,
  type NormalizedEmail,
} from "@/lib/integrations/gmail/gmail-client"
import { resolveAccountByEmailAddresses } from "@/lib/email/inbound"
import { sendAdminAlert } from "@/lib/notifications/admin-alerts"

/**
 * Gmail pull-sync engine (ORR-832 / ORR-775).
 *
 * Pulls a user's inbox into CRM `email_inbound` activities. It is a PURE
 * background job: it builds its own service-role Supabase client (RLS-bypassing,
 * no user session — mirrors token-store's `serviceRoleClient()` / calendar
 * sync), reads the per-user `google_gmail_sync_state`, and drives the pure
 * gmail-client (which owns token refresh + the 404 history-expired error). It
 * NEVER logs token values — the only secret in flight is the access token, which
 * lives inside the gmail-client and never reaches here.
 *
 * Idempotency: each message is upserted on `activities.external_message_id` (a
 * partial-unique key, ORR-830), so re-running a window never duplicates.
 *
 * NOISE GUARD (baked decision): a message is only imported when it resolves to a
 * known account OR contact by its from/to/cc addresses. Unattributed mail is
 * skipped — we never mirror the user's entire mailbox into the CRM.
 */

/** Result of a per-user sync pass. `skipped` = disabled/absent, no work done. */
export interface GmailSyncResult {
  /** Activities created/updated (messages that matched an account or contact). */
  upserted: number
  /** Messages fetched from Gmail this pass (matched + noise-skipped). */
  scanned: number
  skipped?: boolean
}

/** Bounded query for a first (cursor-less) sync — never scan the whole mailbox. */
const BOOTSTRAP_QUERY = "newer_than:30d"

type SyncStateRow =
  Database["public"]["Tables"]["google_gmail_sync_state"]["Row"]

/**
 * Service-role Supabase client. Background sync runs with no user session, so it
 * intentionally bypasses RLS — same idiom as token-store.ts / calendar sync.
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
  /** De-duplicated ids of messages to fetch this pass. */
  messageIds: string[]
  /** The historyId cursor to persist for the next incremental pass. */
  historyId: string | null
}

/**
 * Incremental drain: page through the History API from `startHistoryId`,
 * accumulating de-duplicated added-message ids and advancing to the mailbox's
 * latest historyId. Propagates {@link GmailHistoryExpiredError} for the caller
 * to convert into a bootstrap.
 */
async function drainHistory(
  userId: string,
  startHistoryId: string,
): Promise<DrainResult> {
  const seen = new Set<string>()
  const messageIds: string[] = []
  let latestHistoryId: string | null = null
  let pageToken: string | undefined

  do {
    const res = await listHistory({ userId, startHistoryId, pageToken })
    for (const id of res.addedMessageIds) {
      if (!seen.has(id)) {
        seen.add(id)
        messageIds.push(id)
      }
    }
    if (res.historyId) latestHistoryId = res.historyId
    pageToken = res.nextPageToken
  } while (pageToken)

  return { messageIds, historyId: latestHistoryId }
}

/**
 * Bootstrap drain: capture the mailbox `historyId` FIRST (so messages arriving
 * during the scan aren't missed next pass), then page a bounded recent-message
 * list. Used on the first sync or after a history-expired 404.
 */
async function drainBootstrap(userId: string): Promise<DrainResult> {
  // Read the watermark before scanning so the stored cursor never overshoots
  // messages that land mid-scan.
  const profile = await getProfile(userId)

  const seen = new Set<string>()
  const messageIds: string[] = []
  let pageToken: string | undefined

  do {
    const res = await listMessageIds({
      userId,
      query: BOOTSTRAP_QUERY,
      pageToken,
    })
    for (const id of res.messageIds) {
      if (!seen.has(id)) {
        seen.add(id)
        messageIds.push(id)
      }
    }
    pageToken = res.nextPageToken
  } while (pageToken)

  return { messageIds, historyId: profile.historyId }
}

/**
 * Match exactly one contact whose email (case-insensitively) equals one of the
 * message addresses. Mirrors the calendar sync helper (ORR-826): ILIKE with
 * `_`/`%` escaped, THEN verified against the exact lowercased set in JS so a
 * stray wildcard can never mis-attribute. Zero or ambiguous (>1) → null.
 */
async function resolveContactByEmails(
  client: ServiceClient,
  emails: string[],
): Promise<string | null> {
  const lowered = [
    ...new Set(
      emails.map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0),
    ),
  ]
  if (lowered.length === 0) return null

  const escapeLike = (s: string) => s.replace(/([\\%_])/g, "\\$1")
  const orFilter = lowered.map((e) => `email.ilike.${escapeLike(e)}`).join(",")

  const { data, error } = await client
    .from("contacts")
    .select("id, email")
    .or(orFilter)

  if (error) throw error

  const wanted = new Set(lowered)
  const ids = [
    ...new Set(
      (data ?? [])
        .filter(
          (r) =>
            typeof r.email === "string" &&
            wanted.has(r.email.trim().toLowerCase()),
        )
        .map((r) => r.id),
    ),
  ]
  if (ids.length !== 1) return null
  return ids[0]
}

/** Collect the distinct, non-empty from + to + cc addresses of a message. */
function messageEmails(message: NormalizedEmail): string[] {
  const emails: string[] = []
  if (message.from?.email) emails.push(message.from.email)
  for (const a of message.to) if (a.email) emails.push(a.email)
  for (const a of message.cc) if (a.email) emails.push(a.email)
  return emails
}

/**
 * Fetch, attribute, and (if attributable) upsert one message as an
 * `email_inbound` activity keyed on `external_message_id`. Returns true when an
 * activity was written, false when the noise guard skipped it.
 */
async function ingestMessage(
  client: ServiceClient,
  userId: string,
  messageId: string,
): Promise<boolean> {
  const message = await getMessage({ userId, messageId })
  if (!message.externalMessageId) return false

  const emails = messageEmails(message)
  const accountId = await resolveAccountByEmailAddresses(client, emails)
  const contactId = await resolveContactByEmails(client, emails)

  // NOISE GUARD: only import mail that resolves to a known account OR contact.
  if (!accountId && !contactId) return false

  const { error } = await client.from("activities").upsert(
    {
      user_id: userId,
      type: "email_inbound",
      external_message_id: message.externalMessageId,
      external_thread_id: message.threadId,
      account_id: accountId,
      contact_id: contactId,
      // Opportunity linkage is out of scope for Gmail v1 (ORR-832).
      opportunity_id: null,
      subject: message.subject,
      body: message.bodyText,
      metadata: {
        from: message.from,
        to: message.to,
        cc: message.cc,
        snippet: message.snippet,
        labelIds: message.labelIds,
        // Attachment METADATA only (ORR-831) — no bytes fetched.
        attachments: message.attachments,
        source: "gmail",
      } as unknown as Json,
    },
    { onConflict: "external_message_id" },
  )

  if (error) {
    throw new Error(`Failed to upsert gmail activity: ${error.message}`)
  }
  return true
}

/**
 * Record a dead-letter + admin alert on a sync failure. Reuses the
 * `inbound_email_deadletter` table + admin-alerts channel (the ORR-811 pattern,
 * shared with calendar sync) so operators have one queue for integration
 * failures. Never includes token values — only the user id and error message.
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
        from_address: `gmail-sync:${userId}`,
        to_address: "",
        subject: "Gmail sync failure",
        body: reason,
        raw_payload: { source: "gmail", userId } as unknown as Json,
        reason,
        message_id: `gmail-sync:${userId}:${Date.now()}`,
        alert_sent: false,
      })
      .select("id")
      .single()

    if (error) throw error

    try {
      await sendAdminAlert({
        title: "Gmail sync failed",
        message: `Gmail sync for user ${userId} failed: ${reason}`,
        type: "error",
        metadata: { deadletterId: deadletter.id, userId, reason },
      })
      await client
        .from("inbound_email_deadletter")
        .update({ alert_sent: true })
        .eq("id", deadletter.id)
    } catch (alertError) {
      console.error("Failed to send admin alert for gmail sync:", alertError)
    }
  } catch (dlError) {
    // Never let dead-lettering mask the original failure.
    console.error("Failed to record gmail sync dead-letter:", dlError)
  }
}

async function setStatus(
  client: ServiceClient,
  userId: string,
  patch: Partial<SyncStateRow>,
): Promise<void> {
  await client
    .from("google_gmail_sync_state")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
}

/**
 * Run a full pull-sync pass for one user. Returns counts of upserted activities
 * and scanned messages; `skipped` when the user has no state row or sync is off.
 */
export async function runGmailSyncForUser(
  userId: string,
): Promise<GmailSyncResult> {
  const client = serviceRoleClient()

  const { data: state, error: stateError } = await client
    .from("google_gmail_sync_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (stateError) {
    throw new Error(`Failed to read gmail sync state: ${stateError.message}`)
  }
  if (!state || !state.sync_enabled) {
    return { skipped: true, upserted: 0, scanned: 0 }
  }

  await setStatus(client, userId, { status: "syncing" })

  try {
    // Incremental if we hold a history cursor; on a 404 (history pruned) drop it
    // and do one full bootstrap over the recent window.
    let drain: DrainResult
    if (state.history_id) {
      try {
        drain = await drainHistory(userId, state.history_id)
      } catch (err) {
        if (err instanceof GmailHistoryExpiredError) {
          drain = await drainBootstrap(userId)
        } else {
          throw err
        }
      }
    } else {
      drain = await drainBootstrap(userId)
    }

    let upserted = 0
    for (const messageId of drain.messageIds) {
      if (await ingestMessage(client, userId, messageId)) upserted += 1
    }

    await setStatus(client, userId, {
      // Advance the cursor to the latest historyId. An incremental pass with no
      // changes returns none — keep the existing cursor rather than clearing it.
      history_id: drain.historyId ?? state.history_id ?? null,
      last_sync_at: new Date().toISOString(),
      last_error: null,
      status: "idle",
    })

    return { upserted, scanned: drain.messageIds.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gmail sync failed"
    await setStatus(client, userId, { status: "error", last_error: message })
    await deadletterSyncFailure(client, userId, message)
    throw err
  }
}
