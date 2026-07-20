import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

/**
 * Per-user Google Calendar sync-state reader (ORR-827 / ORR-774).
 *
 * Reads the caller's OWN `public.google_calendar_sync_state` row via the
 * AUTHENTICATED server client — the table has own-row RLS, so the query can only
 * ever return the caller's row. This is the settings-UI read side; it returns a
 * NON-SECRET DTO and deliberately never exposes `sync_token` (the incremental
 * cursor), which is only used by the background sync engine.
 */

export interface CalendarSyncCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

/** Non-secret view of a user's calendar sync state (safe to return to callers). */
export interface CalendarSyncStateInfo {
  syncEnabled: boolean
  status: string
  lastSyncAt: string | null
  lastError: string | null
  calendarId: string
  /** False when the user has never toggled sync (no row yet). */
  exists: boolean
}

/** Sensible default when the user has no sync-state row yet. */
const DEFAULT_STATE: CalendarSyncStateInfo = {
  syncEnabled: false,
  status: "idle",
  lastSyncAt: null,
  lastError: null,
  calendarId: "primary",
  exists: false,
}

/**
 * Return the caller's own calendar sync-state as a non-secret DTO, or a default
 * (disabled / idle / no row) when no row exists. Never returns `sync_token`.
 *
 * The `userId` is used only to scope the read defensively; own-row RLS already
 * confines the result to the authenticated caller.
 */
export async function getCalendarSyncState(
  ctx: CalendarSyncCallContext,
): Promise<CalendarSyncStateInfo> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("google_calendar_sync_state")
    .select("sync_enabled, status, last_sync_at, last_error, calendar_id")
    .eq("user_id", ctx.user.id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load calendar sync state: ${error.message}`)
  }

  if (!data) return DEFAULT_STATE

  return {
    syncEnabled: data.sync_enabled,
    status: data.status,
    lastSyncAt: data.last_sync_at,
    lastError: data.last_error,
    calendarId: data.calendar_id || "primary",
    exists: true,
  }
}
