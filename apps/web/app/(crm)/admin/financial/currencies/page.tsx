import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllCurrencies } from "@/lib/data/currencies"
import { CurrenciesList } from "@/components/admin/financial/currencies-list"
import { updateCurrencyAction } from "./actions"

export default async function AdminCurrenciesPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const currencies = await getAllCurrencies()

  return (
    <CurrenciesList
      currencies={currencies}
      updateAction={updateCurrencyAction}
    />
  )
}
