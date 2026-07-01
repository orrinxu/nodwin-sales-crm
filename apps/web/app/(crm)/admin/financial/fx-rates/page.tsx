import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllFxRates } from "@/lib/data/fx-rates"
import { FxRatesList } from "@/components/admin/financial/fx-rates-list"
import { createFxRateAction } from "./actions"

export default async function AdminFxRatesPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const rates = await getAllFxRates()

  return (
    <FxRatesList
      rates={rates}
      createAction={createFxRateAction}
    />
  )
}
