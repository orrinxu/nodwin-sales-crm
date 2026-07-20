"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/security/auth"
import {
  upsertUserPreferences,
  userPreferencesUpdateSchema,
} from "@/lib/data/user-preferences"
import { updateOwnProfile, ownProfileUpdateSchema } from "@/lib/data/user-profile"
import {
  upsertUserNotificationOverride,
  type NotificationEventType,
  type NotificationChannel,
} from "@/lib/data/notifications"
import { disconnectGoogle } from "@/lib/integrations/google/token-store"
import { createServerClient } from "@/lib/supabase/server"
import { runCalendarSyncForUser } from "@/lib/integrations/calendar/sync"

// Profile: full_name lives on public.users (users_update_own RLS); job_title
// lives on user_preferences. Both are edited from the Profile section.
export async function updateProfileAction(input: { fullName: string; jobTitle: string | null }) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const parsedName = ownProfileUpdateSchema.parse({ fullName: input.fullName })
  await updateOwnProfile(ctx, parsedName)
  await upsertUserPreferences(ctx, { jobTitle: input.jobTitle ?? "" })

  revalidatePath("/settings")
}

export async function updateLocalizationAction(input: unknown) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const parsed = userPreferencesUpdateSchema.parse(input)
  await upsertUserPreferences(ctx, parsed)

  // display_currency drives dashboard/report rollups, so refresh those too.
  revalidatePath("/settings")
  revalidatePath("/dashboard")
  revalidatePath("/reports")
}

export async function updateAppearanceAction(input: { theme: "light" | "dark" | "system" }) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  await upsertUserPreferences(ctx, { theme: input.theme })
  revalidatePath("/settings")
}

// Notification toggles reuse the existing per-user override store. userId is
// forced to the caller — never trust a client-supplied id (RLS also blocks it).
export async function updateNotificationOverrideAction(input: {
  eventType: NotificationEventType
  channel: NotificationChannel
  enabled: boolean
}) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  await upsertUserNotificationOverride(ctx, {
    userId: user.id,
    eventType: input.eventType,
    channel: input.channel,
    enabled: input.enabled,
  })

  revalidatePath("/settings")
}

// Disconnect the caller's own per-user Google connection (ORR-821 / ORR-773):
// best-effort revoke at Google + delete the stored row. userId is forced to the
// caller — never trust a client-supplied id (own-row RLS also blocks it).
export async function disconnectGoogleAction() {
  const user = await requireUser()

  await disconnectGoogle(user.id)

  revalidatePath("/settings")
}

// Enable/disable per-user Google Calendar pull-sync (ORR-827 / ORR-774). UPSERTs
// the caller's OWN google_calendar_sync_state row via the AUTHENTICATED client —
// own-row RLS forbids writing anyone else's row, so user_id is forced to the
// caller. A first enable creates the row (calendar_id defaults to 'primary').
export async function setCalendarSyncEnabledAction(enabled: boolean) {
  const user = await requireUser()
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("google_calendar_sync_state")
    .upsert(
      { user_id: user.id, sync_enabled: enabled },
      { onConflict: "user_id" },
    )

  if (error) {
    throw new Error(`Failed to update calendar sync setting: ${error.message}`)
  }

  revalidatePath("/settings")
}

/** Structured result the settings UI can surface inline (never throws to the client). */
export interface SyncCalendarNowResult {
  ok: boolean
  /** Sync ran but had nothing to do (not connected / sync disabled / no row). */
  skipped?: boolean
  /** Counts on a successful pass. */
  upserted?: number
  removed?: number
  /** Human-readable message on failure. */
  error?: string
}

// Trigger an on-demand Calendar sync for the caller (ORR-827 / ORR-774). Runs the
// service-role sync engine (safe: it only ever touches the caller's own id).
// Errors are caught and returned as a structured result so the client can show an
// inline banner rather than crashing on an unhandled server-action throw.
export async function syncCalendarNowAction(): Promise<SyncCalendarNowResult> {
  const user = await requireUser()

  try {
    const result = await runCalendarSyncForUser(user.id)
    revalidatePath("/settings")
    if (result.skipped) {
      return { ok: true, skipped: true }
    }
    return { ok: true, upserted: result.upserted, removed: result.removed }
  } catch (err) {
    // The engine already dead-letters + alerts on failure; surface a friendly
    // message to the user without leaking internals.
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Calendar sync failed.",
    }
  }
}
