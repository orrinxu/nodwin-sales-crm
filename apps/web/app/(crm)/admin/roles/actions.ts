"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  createRole,
  updateRole,
  deleteRole,
  setRolePermissions,
} from "@/lib/data/roles"

// The roles/permissions admin surface is Super-Admin only (group-wide security config).
export async function createRoleAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const role = await createRole(ctx, input as Parameters<typeof createRole>[1])
  revalidatePath("/admin/roles")
  return role
}

export async function updateRoleAction(id: string, input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const roleId = z.string().uuid().parse(id)
  await updateRole(ctx, roleId, input as Parameters<typeof updateRole>[2])
  revalidatePath("/admin/roles")
}

export async function deleteRoleAction(id: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const roleId = z.string().uuid().parse(id)
  await deleteRole(ctx, roleId)
  revalidatePath("/admin/roles")
}

export async function setRolePermissionsAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await setRolePermissions(ctx, input as Parameters<typeof setRolePermissions>[1])
  revalidatePath("/admin/roles")
}
