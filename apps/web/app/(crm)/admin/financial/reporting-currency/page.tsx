import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllReportingCurrencies } from "@/lib/data/reporting-currency"
import { getAllEntities } from "@/lib/data/entities"
import { getAllCurrencies } from "@/lib/data/currencies"
import { ReportingCurrencyList } from "@/components/admin/financial/reporting-currency-list"
import {
  createReportingCurrencyAction,
  deleteReportingCurrencyAction,
} from "./actions"

export default async function AdminReportingCurrencyPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [settings, entities, currencies] = await Promise.all([
    getAllReportingCurrencies(),
    getAllEntities(ctx),
    getAllCurrencies(),
  ])

  const activeCurrencyCodes = currencies.filter((c) => c.active).map((c) => c.code)

  return (
    <ReportingCurrencyList
      settings={settings}
      entities={entities}
      currencies={activeCurrencyCodes}
      createAction={createReportingCurrencyAction}
      deleteAction={deleteReportingCurrencyAction}
    />
  )
}
