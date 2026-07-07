import { requireUser, requireRole } from "@/lib/security/auth"
import { getRoles, getRolePermissions } from "@/lib/data/roles"
import { RolesList } from "@/components/admin/roles-list"
import { RolePermissionsMatrix } from "@/components/admin/role-permissions-matrix"
import {
  createRoleAction,
  updateRoleAction,
  deleteRoleAction,
  setRolePermissionsAction,
} from "./actions"

export default async function AdminRolesPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [roles, rolePermissions] = await Promise.all([
    getRoles(ctx),
    getRolePermissions(ctx),
  ])

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <RolesList
        roles={roles}
        createAction={createRoleAction}
        updateAction={updateRoleAction}
        deleteAction={deleteRoleAction}
      />
      <RolePermissionsMatrix
        roles={roles}
        rolePermissions={rolePermissions}
        setPermissionsAction={setRolePermissionsAction}
      />
    </div>
  )
}
