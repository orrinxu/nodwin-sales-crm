"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  upsertDriveConfig,
  driveConfigUpsertSchema,
} from "@/lib/data/integrations"

export async function updateDriveConfigAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = driveConfigUpsertSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await upsertDriveConfig(ctx, parsed)
  revalidatePath("/admin/integrations")
}
