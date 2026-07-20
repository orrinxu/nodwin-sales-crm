import { requireUser } from "@/lib/security/auth"
import { getUserPreferences, getCurrencyOptions } from "@/lib/data/user-preferences"
import { getOwnProfile } from "@/lib/data/user-profile"
import { getUserNotificationOverrides } from "@/lib/data/notifications"
import { listApiTokens } from "@/lib/data/api-tokens"
import { getGoogleConnection } from "@/lib/integrations/google/token-store"
import { getCalendarSyncState } from "@/lib/data/calendar-sync"
import { SettingsView } from "@/components/settings/settings-view"
import {
  updateProfileAction,
  updateLocalizationAction,
  updateAppearanceAction,
  updateNotificationOverrideAction,
  disconnectGoogleAction,
  setCalendarSyncEnabledAction,
  syncCalendarNowAction,
} from "./actions"
import { createApiTokenAction, revokeApiTokenAction } from "./api-tokens/actions"

// Per-user settings — available to any authenticated user (not admin-gated).
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>
}) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  // The Google OAuth callback lands back here with ?google=connected|error.
  const { google } = await searchParams
  const googleCallbackStatus =
    google === "connected" || google === "error" ? google : undefined

  const [
    preferences,
    profile,
    currencies,
    notificationOverrides,
    tokens,
    googleConnection,
    calendarSyncState,
  ] = await Promise.all([
    getUserPreferences(ctx),
    getOwnProfile(ctx),
    getCurrencyOptions(ctx),
    getUserNotificationOverrides(ctx, user.id),
    listApiTokens(ctx),
    getGoogleConnection(user.id),
    getCalendarSyncState(ctx),
  ])

  return (
    <SettingsView
      preferences={preferences}
      profile={profile}
      currencies={currencies}
      notificationOverrides={notificationOverrides}
      updateProfileAction={updateProfileAction}
      updateLocalizationAction={updateLocalizationAction}
      updateAppearanceAction={updateAppearanceAction}
      updateNotificationOverrideAction={updateNotificationOverrideAction}
      tokens={tokens}
      createTokenAction={createApiTokenAction}
      revokeTokenAction={revokeApiTokenAction}
      googleConnection={googleConnection}
      googleCallbackStatus={googleCallbackStatus}
      disconnectGoogleAction={disconnectGoogleAction}
      calendarSyncState={calendarSyncState}
      setCalendarSyncEnabledAction={setCalendarSyncEnabledAction}
      syncCalendarNowAction={syncCalendarNowAction}
    />
  )
}
