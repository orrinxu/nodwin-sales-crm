import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllRegions } from "@/lib/data/regions"
import { RegionsList } from "@/components/admin/regions-list"
import {
  createRegionAction,
  updateRegionAction,
  deactivateRegionAction,
} from "./actions"

export default async function AdminRegionsPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const regions = await getAllRegions(ctx)

  return (
    <RegionsList
      regions={regions}
      createAction={createRegionAction}
      updateAction={updateRegionAction}
      deactivateAction={deactivateRegionAction}
    />
  )
}
