import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllFieldDefinitions } from "@/lib/data/field-definitions"
import { getAllFileTypeCategories } from "@/lib/data/file-type-categories"
import { FieldDefinitionsList } from "@/components/admin/field-definitions-list"
import {
  bulkDeleteFieldDefinitionsAction,
  createFieldDefinitionAction,
  reorderFieldDefinitionsAction,
  softDeleteFieldDefinitionAction,
  updateFieldDefinitionAction,
  createFileTypeCategoryAction,
  updateFileTypeCategoryAction,
  deleteFileTypeCategoryAction,
  reorderFileTypeCategoriesAction,
} from "./actions"

export default async function AdminFieldDefinitionsPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const fieldDefinitions = await getAllFieldDefinitions(ctx)
  const fileTypeCategories = await getAllFileTypeCategories()

  return (
    <FieldDefinitionsList
      fieldDefinitions={fieldDefinitions}
      fileTypeCategories={fileTypeCategories}
      createAction={createFieldDefinitionAction}
      bulkDeleteAction={bulkDeleteFieldDefinitionsAction}
      softDeleteAction={softDeleteFieldDefinitionAction}
      updateAction={updateFieldDefinitionAction}
      reorderAction={reorderFieldDefinitionsAction}
      createFileTypeCategoryAction={createFileTypeCategoryAction}
      updateFileTypeCategoryAction={updateFileTypeCategoryAction}
      deleteFileTypeCategoryAction={deleteFileTypeCategoryAction}
      reorderFileTypeCategoriesAction={reorderFileTypeCategoriesAction}
    />
  )
}
