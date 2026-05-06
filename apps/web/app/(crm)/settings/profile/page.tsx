import { requireUser } from "@/lib/security/auth"
import { getProfile } from "@/lib/data/users"
import { ProfileForm } from "@/components/settings/profile-form"
import { updateProfileName, updateNotificationPreferences } from "./actions"

export default async function ProfilePage() {
  const user = await requireUser()
  const profile = await getProfile({ user, source: "web" })

  return (
    <ProfileForm
      profile={profile}
      updateNameAction={updateProfileName}
      updateNotificationsAction={updateNotificationPreferences}
    />
  )
}
