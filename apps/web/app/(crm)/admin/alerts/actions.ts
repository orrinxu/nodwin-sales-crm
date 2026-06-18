"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import { acknowledgeAlert, acknowledgeAllAlerts } from "@/lib/data/admin-alerts"

export async function acknowledgeAlertAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  await acknowledgeAlert(id)
  revalidatePath("/admin/alerts")
}

export async function acknowledgeAllAlertsAction() {
  const user = await requireUser()
  requireRole(user, "admin")
  await acknowledgeAllAlerts()
  revalidatePath("/admin/alerts")
}
