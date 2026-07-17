import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { USER_ROLES, type UserRole } from "@/lib/data/users.types"
import { isPermissionKey } from "@/lib/data/permissions"

/**
 * Roles & permissions data layer (mirrors relationship-types.ts). Roles are
 * assignable identities; each carries a `baseRole` (an existing user_role enum
 * value) that anchors its row-level access to the existing RLS, while the
 * role×permission matrix layers app-level capabilities. System roles mirror the
 * enum 1:1 and are non-deletable. Custom roles cannot base on `admin`/`entity_admin`
 * (an admin-based role would bypass the permission matrix entirely).
 */

export interface RolesCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

/** Base roles a custom role may anchor to — excludes the admin tiers. */
export const BASE_ROLE_OPTIONS: UserRole[] = USER_ROLES.filter(
  (r): r is UserRole => r !== "admin" && r !== "entity_admin",
)

export interface RoleRecord {
  id: string
  key: string
  label: string
  description: string | null
  baseRole: string
  isSystem: boolean
  isActive: boolean
  assignedUserCount: number
  createdAt: string
  updatedAt: string
}

export interface RolePermissionRow {
  roleId: string
  permissionKey: string
}

export const roleCreateSchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Key must start with a letter and contain only lowercase letters, numbers, and underscores"),
  label: z.string().min(1, "Label is required").max(200),
  description: z.string().max(1000).nullable().optional().or(z.literal("")),
  baseRole: z
    .string()
    .refine((v): v is UserRole => BASE_ROLE_OPTIONS.includes(v as UserRole), {
      message: "Invalid base role",
    }),
})

export const roleUpdateSchema = z.object({
  label: z.string().min(1, "Label is required").max(200).optional(),
  description: z.string().max(1000).nullable().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
})

export const setRolePermissionsSchema = z.object({
  roleId: z.string().uuid(),
  permissionKeys: z.array(z.string()).max(200),
})

export type RoleCreateInput = z.input<typeof roleCreateSchema>
export type RoleUpdateInput = z.input<typeof roleUpdateSchema>
export type SetRolePermissionsInput = z.input<typeof setRolePermissionsSchema>

function toDomainRole(data: Record<string, unknown>, assignedUserCount: number): RoleRecord {
  return {
    id: data.id as string,
    key: data.key as string,
    label: data.label as string,
    description: (data.description as string) ?? null,
    baseRole: data.base_role as string,
    isSystem: (data.is_system as boolean) ?? false,
    isActive: (data.is_active as boolean) ?? true,
    assignedUserCount,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

/** All roles with their assigned-user counts (system roles first, then by label). */
export async function getRoles(ctx: RolesCallContext): Promise<RoleRecord[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .order("is_system", { ascending: false })
    .order("label", { ascending: true })

  if (error) throw new Error(`Failed to load roles: ${error.message}`)

  const rows = (data ?? []) as Record<string, unknown>[]

  // Per-role head counts in ONE GROUP BY (ORR-761) — was N per-role round-trips.
  const { data: countRows, error: countError } = await supabase.rpc("role_user_counts")
  if (countError) throw new Error(`Failed to load role counts: ${countError.message}`)
  const countByRole = new Map<string, number>()
  for (const c of (countRows ?? []) as { role_id: string; user_count: number }[]) {
    countByRole.set(c.role_id, Number(c.user_count))
  }

  return rows.map((r) => toDomainRole(r, countByRole.get(r.id as string) ?? 0))
}

export async function createRole(
  ctx: RolesCallContext,
  input: RoleCreateInput,
): Promise<RoleRecord> {
  const parsed = roleCreateSchema.parse(input)
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("roles")
    .insert({
      key: parsed.key,
      label: parsed.label,
      description: parsed.description || null,
      base_role: parsed.baseRole,
      is_system: false,
    })
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      throw new Error(`A role with key '${parsed.key}' already exists`)
    }
    throw new Error(`Failed to create role: ${error.message}`)
  }

  return toDomainRole(data as Record<string, unknown>, 0)
}

export async function updateRole(
  ctx: RolesCallContext,
  id: string,
  input: RoleUpdateInput,
): Promise<void> {
  const parsed = roleUpdateSchema.parse(input)
  const supabase = await createServerClient()

  // System roles keep their key/base_role/active — only label & description are editable.
  const { data: existing, error: fetchErr } = await supabase
    .from("roles")
    .select("is_system")
    .eq("id", id)
    .single()
  if (fetchErr || !existing) throw new Error("Role not found")

  const dbData: Record<string, unknown> = {}
  if (parsed.label !== undefined) dbData.label = parsed.label
  if (parsed.description !== undefined) dbData.description = parsed.description || null
  if (parsed.isActive !== undefined) {
    if (existing.is_system) {
      throw new Error("System roles cannot be deactivated")
    }
    dbData.is_active = parsed.isActive
  }

  if (Object.keys(dbData).length === 0) throw new Error("No fields to update")

  const { error } = await supabase.from("roles").update(dbData as never).eq("id", id)
  if (error) throw new Error(`Failed to update role: ${error.message}`)
}

export async function deleteRole(ctx: RolesCallContext, id: string): Promise<void> {
  const supabase = await createServerClient()

  const { data: role, error: fetchErr } = await supabase
    .from("roles")
    .select("is_system")
    .eq("id", id)
    .single()
  if (fetchErr || !role) throw new Error("Role not found")
  if (role.is_system) throw new Error("System roles cannot be deleted")

  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role_id", id)
  if ((count ?? 0) > 0) {
    throw new Error(
      `This role is assigned to ${count} user${count === 1 ? "" : "s"}. Reassign them before deleting.`,
    )
  }

  const { error } = await supabase.from("roles").delete().eq("id", id)
  if (error) throw new Error(`Failed to delete role: ${error.message}`)
}

/** The full role×permission grid (bounded by #roles × #permissions). */
export async function getRolePermissions(
  ctx: RolesCallContext,
): Promise<RolePermissionRow[]> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("role_permissions")
    .select("role_id, permission_key")
  if (error) throw new Error(`Failed to load role permissions: ${error.message}`)
  return (data ?? []).map((r) => ({
    roleId: r.role_id as string,
    permissionKey: r.permission_key as string,
  }))
}

/** Atomically replace a role's permission set (via the admin-only RPC). */
export async function setRolePermissions(
  ctx: RolesCallContext,
  input: SetRolePermissionsInput,
): Promise<void> {
  const parsed = setRolePermissionsSchema.parse(input)
  // Only real catalogue keys — silently drop anything unknown.
  const keys = parsed.permissionKeys.filter(isPermissionKey)
  const supabase = await createServerClient()
  const { error } = await supabase.rpc("set_role_permissions", {
    _role_id: parsed.roleId,
    _keys: keys,
  })
  if (error) throw new Error(`Failed to save permissions: ${error.message}`)
}
