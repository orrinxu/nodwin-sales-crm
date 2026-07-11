"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireAdminAccess } from "@/lib/security/auth"
import { setCostOfCashSettings, costOfCashUpdateSchema } from "@/lib/data/finance-settings"

export async function saveCostOfCashAction(input: unknown): Promise<void> {
  const user = await requireUser()
  requireAdminAccess(user)
  const parsed = costOfCashUpdateSchema.parse(input)
  await setCostOfCashSettings({ user, source: "web" }, parsed)
  revalidatePath("/admin/finance")
}
