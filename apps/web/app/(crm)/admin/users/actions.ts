"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireAdminAccess } from "@/lib/security/auth"
import { updateUserAdmin, userAdminUpdateSchema } from "@/lib/data/users"

export async function updateUserAction(userId: string, input: unknown) {
  const user = await requireUser()
  // Admit both admin tiers; RLS + the prevent_role_escalation trigger confine an
  // Entity Admin to non-privileged edits of their own entity's users.
  requireAdminAccess(user)
  const parsed = userAdminUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await updateUserAdmin(ctx, userId, parsed)
  revalidatePath("/admin/users")
}
