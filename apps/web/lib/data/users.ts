import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import {
  USER_ROLES,
  userAdminUpdateSchema,
  type UserRole,
  type AdminUserRecord,
  type UserAdminUpdateInput,
} from "@/lib/data/users.types"

// Re-export the client-safe pieces so server callers can keep importing from here.
export {
  USER_ROLES,
  userAdminUpdateSchema,
  type UserRole,
  type AdminUserRecord,
  type UserAdminUpdateInput,
}

export interface UsersCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

// Admin-only listing (RLS: users_select_self_and_same_entity admits admins to
// all rows). Resolves entity / business-unit / manager display names from
// sibling reads rather than relying on FK embeds.
export async function getAllUsers(ctx: UsersCallContext): Promise<AdminUserRecord[]> {
  void ctx
  const supabase = await createServerClient()

  const [{ data: users, error }, { data: entities }, { data: businessUnits }, { data: roles }] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, email, full_name, primary_role, role_id, primary_entity_id, primary_business_unit_id, manager_user_id, active, crm_inbound_email",
      )
      .order("full_name", { ascending: true }),
    supabase.from("entities").select("id, name"),
    supabase.from("business_units").select("id, name"),
    supabase.from("roles").select("id, label"),
  ])

  if (error) {
    throw new Error(`Failed to load users: ${error.message}`)
  }

  const rows = (users ?? []) as Record<string, unknown>[]
  const entityName = new Map(
    ((entities ?? []) as Record<string, unknown>[]).map((e) => [e.id as string, e.name as string]),
  )
  const buName = new Map(
    ((businessUnits ?? []) as Record<string, unknown>[]).map((b) => [b.id as string, b.name as string]),
  )
  const roleName = new Map(
    ((roles ?? []) as Record<string, unknown>[]).map((r) => [r.id as string, r.label as string]),
  )
  const userName = new Map(rows.map((u) => [u.id as string, (u.full_name as string) ?? null]))

  return rows.map((u) => ({
    id: u.id as string,
    email: (u.email as string) ?? null,
    fullName: (u.full_name as string) ?? null,
    role: (u.primary_role as UserRole) ?? "sales_rep",
    roleId: (u.role_id as string) ?? null,
    roleLabel: u.role_id ? roleName.get(u.role_id as string) ?? null : null,
    active: (u.active as boolean) ?? true,
    crmInboundEmail: (u.crm_inbound_email as string) ?? null,
    primaryEntityId: (u.primary_entity_id as string) ?? null,
    primaryEntityName: u.primary_entity_id ? entityName.get(u.primary_entity_id as string) ?? null : null,
    primaryBusinessUnitId: (u.primary_business_unit_id as string) ?? null,
    primaryBusinessUnitName: u.primary_business_unit_id
      ? buName.get(u.primary_business_unit_id as string) ?? null
      : null,
    managerUserId: (u.manager_user_id as string) ?? null,
    managerName: u.manager_user_id ? userName.get(u.manager_user_id as string) ?? null : null,
  }))
}

function toDb(input: z.infer<typeof userAdminUpdateSchema>): Record<string, unknown> {
  const db: Record<string, unknown> = {}
  if (input.fullName !== undefined) db.full_name = input.fullName
  // Prefer role_id (the DB trigger syncs primary_role from its base_role); fall
  // back to the legacy primary_role enum path for non-UI callers.
  if (input.roleId !== undefined) db.role_id = input.roleId
  else if (input.role !== undefined) db.primary_role = input.role
  if ("primaryEntityId" in input) db.primary_entity_id = input.primaryEntityId ?? null
  if ("primaryBusinessUnitId" in input) db.primary_business_unit_id = input.primaryBusinessUnitId ?? null
  if ("managerUserId" in input) db.manager_user_id = input.managerUserId ?? null
  if (input.active !== undefined) db.active = input.active
  return db
}

// Admin edit of another user. RLS (admins_update_all) + the
// prevent_role_escalation trigger already permit an admin to change role /
// manager / entity. Guards against self-lockout (an admin removing their own
// admin role or deactivating themselves).
export async function updateUserAdmin(
  ctx: UsersCallContext,
  userId: string,
  input: UserAdminUpdateInput,
): Promise<void> {
  const parsed = userAdminUpdateSchema.parse(input)
  const supabase = await createServerClient()

  if (userId === ctx.user.id) {
    if (parsed.role !== undefined && parsed.role !== "admin") {
      throw new Error("You cannot remove your own admin role.")
    }
    // Assigning yourself a role whose base isn't admin would demote you.
    if (parsed.roleId !== undefined) {
      const { data: target } = await supabase
        .from("roles")
        .select("base_role")
        .eq("id", parsed.roleId)
        .single()
      if (target && target.base_role !== "admin") {
        throw new Error("You cannot remove your own admin role.")
      }
    }
    if (parsed.active === false) {
      throw new Error("You cannot deactivate your own account.")
    }
  }

  const db = toDb(parsed)
  if (Object.keys(db).length === 0) return

  const { error } = await supabase.from("users").update(db as never).eq("id", userId)

  if (error) {
    throw new Error(`Failed to update user: ${error.message}`)
  }
}
