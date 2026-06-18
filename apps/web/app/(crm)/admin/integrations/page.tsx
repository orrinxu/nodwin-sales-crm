import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllEntities } from "@/lib/data/entities"
import {
  getIntegrationsAction,
  updateIntegrationSettingsAction,
  updateDriveConfigAction,
} from "./actions"
import { IntegrationsPage } from "@/components/admin/integrations-page"

export default async function AdminIntegrationsPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [{ settings, driveConfig, health }, entities] = await Promise.all([
    getIntegrationsAction(),
    getAllEntities(ctx),
  ])

  return (
    <IntegrationsPage
      settings={settings}
      driveConfig={driveConfig}
      health={health}
      entities={entities}
      updateSettingAction={updateIntegrationSettingsAction}
      updateDriveConfigAction={updateDriveConfigAction}
    />
  )
}
