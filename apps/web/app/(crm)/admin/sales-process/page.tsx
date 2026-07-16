import { requireUser, requireRole } from "@/lib/security/auth"
import { getSalesProcessSettings } from "@/lib/data/sales-process-settings"
import { SalesProcessForm } from "@/components/admin/sales-process-form"
import { updateSalesProcessSettingsAction } from "./actions"

export default async function AdminSalesProcessPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const settings = await getSalesProcessSettings(ctx)

  return (
    <SalesProcessForm settings={settings} updateAction={updateSalesProcessSettingsAction} />
  )
}
