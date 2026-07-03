import { requireUser } from "@/lib/security/auth"
import { getUserPreferences, getCurrencyOptions } from "@/lib/data/user-preferences"
import { getOwnProfile } from "@/lib/data/user-profile"
import { getUserNotificationOverrides } from "@/lib/data/notifications"
import { SettingsView } from "@/components/settings/settings-view"
import {
  updateProfileAction,
  updateLocalizationAction,
  updateAppearanceAction,
  updateNotificationOverrideAction,
} from "./actions"

// Per-user settings — available to any authenticated user (not admin-gated).
export default async function SettingsPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const [preferences, profile, currencies, notificationOverrides] = await Promise.all([
    getUserPreferences(ctx),
    getOwnProfile(ctx),
    getCurrencyOptions(ctx),
    getUserNotificationOverrides(ctx, user.id),
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
    />
  )
}
