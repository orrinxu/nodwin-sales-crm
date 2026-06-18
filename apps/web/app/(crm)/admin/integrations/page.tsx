import { requireUser, requireRole } from "@/lib/security/auth"
import { listEntities, getDriveConfigs } from "@/lib/data/integrations"
import { IntegrationsSettings } from "@/components/admin/integrations-settings"
import { updateDriveConfigAction } from "./actions"

export default async function AdminIntegrationsPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [entities, driveConfigs] = await Promise.all([
    listEntities(ctx),
    getDriveConfigs(ctx),
  ])

  return (
    <IntegrationsSettings
      entities={entities}
      driveConfigs={driveConfigs}
      updateDriveConfigAction={updateDriveConfigAction}
    />
  )
}
