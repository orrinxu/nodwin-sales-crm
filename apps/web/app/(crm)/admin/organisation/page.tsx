import { requireUser, requireRole } from "@/lib/security/auth"
import {
  getReportingCurrencyOverview,
  DEFAULT_REPORTING_CURRENCY,
} from "@/lib/data/organisation-settings"
import { getCurrencyOptions } from "@/lib/data/user-preferences"
import { getAllEntities } from "@/lib/data/entities"
import { OrganisationSettings } from "@/components/admin/organisation-settings"
import {
  setGroupReportingCurrencyAction,
  setEntityReportingCurrencyAction,
  removeEntityReportingCurrencyAction,
} from "./actions"

export default async function AdminOrganisationPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [overview, currencies, entities] = await Promise.all([
    getReportingCurrencyOverview(ctx),
    getCurrencyOptions(ctx),
    getAllEntities(ctx),
  ])

  return (
    <OrganisationSettings
      overview={overview}
      currencies={currencies}
      entities={entities.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name }))}
      defaultCurrency={DEFAULT_REPORTING_CURRENCY}
      setGroupAction={setGroupReportingCurrencyAction}
      setEntityAction={setEntityReportingCurrencyAction}
      removeEntityAction={removeEntityReportingCurrencyAction}
    />
  )
}
