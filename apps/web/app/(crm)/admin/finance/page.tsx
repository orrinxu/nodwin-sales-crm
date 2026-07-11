import { requireUser, requireAdminAccess } from "@/lib/security/auth"
import { getCostOfCashSettings } from "@/lib/data/finance-settings"
import { FinanceSettings } from "@/components/admin/finance-settings"
import { saveCostOfCashAction } from "./actions"

export default async function AdminFinancePage() {
  const user = await requireUser()
  requireAdminAccess(user)

  const settings = await getCostOfCashSettings({ user, source: "web" })

  return <FinanceSettings settings={settings} saveAction={saveCostOfCashAction} />
}
