import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

/**
 * Per-user Gmail sync-state reader (ORR-833 / ORR-775).
 *
 * Reads the caller's OWN `public.google_gmail_sync_state` row via the
 * AUTHENTICATED server client — the table has own-row RLS, so the query can only
 * ever return the caller's row. This is the settings-UI read side; it returns a
 * NON-SECRET DTO and deliberately never exposes `history_id` (the incremental
 * cursor), which is only used by the background sync engine.
 *
 * Mirrors `lib/data/calendar-sync.ts`.
 */

export interface GmailSyncCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

/** Non-secret view of a user's Gmail sync state (safe to return to callers). */
export interface GmailSyncStateInfo {
  syncEnabled: boolean
  status: string
  lastSyncAt: string | null
  lastError: string | null
  /** False when the user has never toggled sync (no row yet). */
  exists: boolean
}

/** Sensible default when the user has no sync-state row yet. */
const DEFAULT_STATE: GmailSyncStateInfo = {
  syncEnabled: false,
  status: "idle",
  lastSyncAt: null,
  lastError: null,
  exists: false,
}

/**
 * Return the caller's own Gmail sync-state as a non-secret DTO, or a default
 * (disabled / idle / no row) when no row exists. Never returns `history_id`.
 *
 * The `userId` is used only to scope the read defensively; own-row RLS already
 * confines the result to the authenticated caller.
 */
export async function getGmailSyncState(
  ctx: GmailSyncCallContext,
): Promise<GmailSyncStateInfo> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("google_gmail_sync_state")
    .select("sync_enabled, status, last_sync_at, last_error")
    .eq("user_id", ctx.user.id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load gmail sync state: ${error.message}`)
  }

  if (!data) return DEFAULT_STATE

  return {
    syncEnabled: data.sync_enabled,
    status: data.status,
    lastSyncAt: data.last_sync_at,
    lastError: data.last_error,
    exists: true,
  }
}
