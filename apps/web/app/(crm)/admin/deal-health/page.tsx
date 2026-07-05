import { requireUser, requireRole } from "@/lib/security/auth"
import { getStuckDealSettings } from "@/lib/data/stuck-deal-settings"
import { DealHealthForm } from "@/components/admin/deal-health-form"
import { saveStuckThresholdsAction } from "./actions"

export const metadata = {
  title: "Deal Health - Nodwin CRM",
}

export default async function AdminDealHealthPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const rows = await getStuckDealSettings(ctx)

  return <DealHealthForm rows={rows} saveAction={saveStuckThresholdsAction} />
}
