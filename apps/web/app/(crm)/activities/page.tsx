import { requireUser } from "@/lib/security/auth"
import { getActivities } from "@/lib/data/activities"
import { ActivitiesPage } from "@/components/activities/activities-page"

export const metadata = {
  title: "Activities - Nodwin CRM",
}

export default async function ActivitiesPageRoute() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const activities = await getActivities(ctx)

  return <ActivitiesPage activities={activities} />
}
