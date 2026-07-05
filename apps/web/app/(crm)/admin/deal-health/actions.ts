"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import { updateStuckDealSettings } from "@/lib/data/stuck-deal-settings"

export async function saveStuckThresholdsAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await updateStuckDealSettings(ctx, input as never)
  revalidatePath("/admin/deal-health")
  // The dashboard widget reads these thresholds; refresh it too.
  revalidatePath("/dashboard")
}
