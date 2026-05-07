import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllFieldDefinitions } from "@/lib/data/field-definitions"
import { FieldDefinitionsList } from "@/components/admin/field-definitions-list"

export default async function AdminFieldDefinitionsPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const fieldDefinitions = await getAllFieldDefinitions(ctx)

  return <FieldDefinitionsList fieldDefinitions={fieldDefinitions} />
}
