import { requireUser, requireAdminAccess, isSuperAdmin } from "@/lib/security/auth"
import {
  getReportingCurrencyOverview,
  getCurrentUserEntityId,
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
  requireAdminAccess(user)
  const superAdmin = isSuperAdmin(user)
  const ctx = { user, source: "web" as const }

  const [overview, currencies, entities] = await Promise.all([
    getReportingCurrencyOverview(ctx),
    getCurrencyOptions(ctx),
    getAllEntities(ctx),
  ])

  let entityOptions = entities.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name }))
  let scopedOverview = overview

  // An Entity Admin manages only their own entity's override (and can't touch
  // the group-wide default — the UI hides it and RLS blocks it either way).
  if (!superAdmin) {
    const myEntityId = await getCurrentUserEntityId(ctx)
    entityOptions = entityOptions.filter((e) => e.id === myEntityId)
    scopedOverview = {
      groupDefault: overview.groupDefault,
      entityOverrides: overview.entityOverrides.filter((o) => o.entityId === myEntityId),
    }
  }

  return (
    <OrganisationSettings
      overview={scopedOverview}
      currencies={currencies}
      entities={entityOptions}
      defaultCurrency={DEFAULT_REPORTING_CURRENCY}
      canEditGroupDefault={superAdmin}
      setGroupAction={setGroupReportingCurrencyAction}
      setEntityAction={setEntityReportingCurrencyAction}
      removeEntityAction={removeEntityReportingCurrencyAction}
    />
  )
}
