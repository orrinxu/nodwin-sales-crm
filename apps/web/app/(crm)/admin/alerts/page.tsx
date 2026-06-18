import { requireUser, requireRole } from "@/lib/security/auth"
import { getAdminAlerts } from "@/lib/data/admin-alerts"
import { AdminAlertsPage } from "@/components/notifications/admin-alerts-page"
import { acknowledgeAlertAction, acknowledgeAllAlertsAction } from "./actions"

export default async function AdminAlertsPageRoute() {
  const user = await requireUser()
  requireRole(user, "admin")

  const { alerts, total } = await getAdminAlerts({ includeAcknowledged: true, limit: 50 })

  return (
    <AdminAlertsPage
      alerts={alerts}
      total={total}
      acknowledgeAction={acknowledgeAlertAction}
      acknowledgeAllAction={acknowledgeAllAlertsAction}
    />
  )
}
