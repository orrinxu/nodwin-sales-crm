import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllBusinessUnits } from "@/lib/data/business-units"
import { getAllEntities } from "@/lib/data/entities"
import { BusinessUnitsList } from "@/components/admin/business-units-list"
import {
  createBusinessUnitAction,
  updateBusinessUnitAction,
  deactivateBusinessUnitAction,
} from "./actions"

export default async function AdminBusinessUnitsPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const [businessUnits, entities] = await Promise.all([
    getAllBusinessUnits(ctx),
    getAllEntities(ctx),
  ])

  return (
    <BusinessUnitsList
      businessUnits={businessUnits}
      entities={entities}
      createAction={createBusinessUnitAction}
      updateAction={updateBusinessUnitAction}
      deactivateAction={deactivateBusinessUnitAction}
    />
  )
}
