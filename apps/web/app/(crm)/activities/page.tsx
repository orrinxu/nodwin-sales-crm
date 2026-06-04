import { requireUser } from "@/lib/security/auth"
import { getActivities } from "@/lib/data/activities"
import { ActivitiesView } from "@/components/activities/activities-view"

export default async function ActivitiesPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const activities = await getActivities(ctx)

  return <ActivitiesView activities={activities} />
}
