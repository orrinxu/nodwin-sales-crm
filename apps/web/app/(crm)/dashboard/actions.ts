"use server"

import { requireUser } from "@/lib/security/auth"
import {
  saveDashboardLayout,
  resetDashboardLayout,
  dashboardLayoutSchema,
} from "@/lib/data/dashboard-layout"

export async function saveDashboardLayoutAction(input: unknown) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const parsed = dashboardLayoutSchema.parse(input)
  await saveDashboardLayout(ctx, parsed)
}

export async function resetDashboardLayoutAction() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  await resetDashboardLayout(ctx)
}
