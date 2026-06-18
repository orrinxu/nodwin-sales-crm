import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllEntities } from "@/lib/data/entities"
import {
  getIntegrationsAction,
  updateDriveConfigAction,
} from "./actions"
import { IntegrationsPage } from "@/components/admin/integrations-page"

export default async function AdminIntegrationsPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [{ slackConnections, emailSettings, salesforceConnections, driveConfig }, entities] =
    await Promise.all([
      getIntegrationsAction(),
      getAllEntities(ctx),
    ])

  return (
    <IntegrationsPage
      slackConnections={slackConnections}
      emailSettings={emailSettings}
      salesforceConnections={salesforceConnections}
      driveConfig={driveConfig}
      entities={entities}
      updateDriveConfigAction={updateDriveConfigAction}
    />
  )
}
