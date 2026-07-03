import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllUsers } from "@/lib/data/users"
import { getAllEntities } from "@/lib/data/entities"
import { getAllBusinessUnits } from "@/lib/data/business-units"
import { UsersList } from "@/components/admin/users-list"
import { updateUserAction } from "./actions"

export default async function AdminUsersPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [users, entities, businessUnits] = await Promise.all([
    getAllUsers(ctx),
    getAllEntities(ctx),
    getAllBusinessUnits(ctx),
  ])

  return (
    <UsersList
      users={users}
      currentUserId={user.id}
      entities={entities.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name }))}
      businessUnits={businessUnits.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name }))}
      updateAction={updateUserAction}
    />
  )
}
