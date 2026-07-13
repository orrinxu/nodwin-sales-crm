import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllEntities } from "@/lib/data/entities"
import { getAllRegions } from "@/lib/data/regions"
import { EntitiesList } from "@/components/admin/entities-list"
import {
  createEntityAction,
  updateEntityAction,
  deactivateEntityAction,
} from "./actions"

export default async function AdminEntitiesPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const [entities, regions] = await Promise.all([getAllEntities(ctx), getAllRegions(ctx)])
  // Only active regions are assignable; a region already set on an entity but since
  // deactivated still resolves by id (the value is kept, just not offered as new).
  const regionOptions = regions.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name }))

  return (
    <EntitiesList
      entities={entities}
      regions={regionOptions}
      createAction={createEntityAction}
      updateAction={updateEntityAction}
      deactivateAction={deactivateEntityAction}
    />
  )
}
