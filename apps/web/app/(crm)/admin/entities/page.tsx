import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllEntities } from "@/lib/data/entities"
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
  const entities = await getAllEntities(ctx)

  return (
    <EntitiesList
      entities={entities}
      createAction={createEntityAction}
      updateAction={updateEntityAction}
      deactivateAction={deactivateEntityAction}
    />
  )
}
