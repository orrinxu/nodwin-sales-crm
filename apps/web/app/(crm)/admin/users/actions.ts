"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import { updateUserAdmin, userAdminUpdateSchema } from "@/lib/data/users"

export async function updateUserAction(userId: string, input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = userAdminUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await updateUserAdmin(ctx, userId, parsed)
  revalidatePath("/admin/users")
}
