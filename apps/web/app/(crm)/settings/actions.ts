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
