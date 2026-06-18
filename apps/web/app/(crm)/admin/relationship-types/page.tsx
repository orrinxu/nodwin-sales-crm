import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllRelationshipTypes } from "@/lib/data/relationship-types"
import { RelationshipTypesList } from "@/components/admin/relationship-types-list"
import {
  createRelationshipTypeAction,
  updateRelationshipTypeAction,
  deactivateRelationshipTypeAction,
} from "./actions"

export default async function AdminRelationshipTypesPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const relationshipTypes = await getAllRelationshipTypes(ctx)

  return (
    <RelationshipTypesList
      relationshipTypes={relationshipTypes}
      createAction={createRelationshipTypeAction}
      updateAction={updateRelationshipTypeAction}
      deactivateAction={deactivateRelationshipTypeAction}
    />
  )
}
