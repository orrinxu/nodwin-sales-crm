import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllFiscalYearSettings } from "@/lib/data/fiscal-year"
import { getAllEntities } from "@/lib/data/entities"
import { FiscalYearList } from "@/components/admin/financial/fiscal-year-list"
import { upsertFiscalYearSettingAction } from "./actions"

export default async function AdminFiscalYearPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [settings, entities] = await Promise.all([
    getAllFiscalYearSettings(),
    getAllEntities(ctx),
  ])

  return (
    <FiscalYearList
      settings={settings}
      entities={entities}
      upsertAction={upsertFiscalYearSettingAction}
    />
  )
}
