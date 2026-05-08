import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllFieldDefinitions } from "@/lib/data/field-definitions"
import { FieldDefinitionsList } from "@/components/admin/field-definitions-list"
import {
  bulkDeleteFieldDefinitionsAction,
  createFieldDefinitionAction,
  reorderFieldDefinitionsAction,
  softDeleteFieldDefinitionAction,
  updateFieldDefinitionAction,
} from "./actions"

export default async function AdminFieldDefinitionsPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const fieldDefinitions = await getAllFieldDefinitions(ctx)

  return (
    <FieldDefinitionsList
      fieldDefinitions={fieldDefinitions}
      createAction={createFieldDefinitionAction}
      bulkDeleteAction={bulkDeleteFieldDefinitionsAction}
      softDeleteAction={softDeleteFieldDefinitionAction}
      updateAction={updateFieldDefinitionAction}
      reorderAction={reorderFieldDefinitionsAction}
    />
  )
}
