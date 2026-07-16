"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  updateSalesProcessSettings,
  salesProcessSettingsUpdateSchema,
} from "@/lib/data/sales-process-settings"

export async function updateSalesProcessSettingsAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = salesProcessSettingsUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const settings = await updateSalesProcessSettings(ctx, parsed)
  revalidatePath("/admin/sales-process")
  return settings
}
