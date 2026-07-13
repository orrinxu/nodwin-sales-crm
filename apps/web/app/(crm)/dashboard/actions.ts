"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/security/auth"
import {
  saveDashboardLayout,
  resetDashboardLayout,
  dashboardLayoutSchema,
} from "@/lib/data/dashboard-layout"
import {
  createActivity,
  activityCreateSchema,
  type ActivityRecord,
} from "@/lib/data/activities"

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

/**
 * Log a "touch" (call / email / meeting / note) against a deal straight from the
 * dashboard's "Needs my attention" list — the Reconnect CTA. Recording a real
 * activity resets that deal's last-contact clock, so it drops off the stale /
 * needs-a-touch list on the next load. `opportunityId` also revalidates the
 * deal's own page so its activity feed reflects the touch immediately.
 *
 * This deliberately logs an activity the rep actually performed; it does NOT
 * schedule a calendar meeting (no Calendar integration exists yet — that upgrade
 * is a separate ticket).
 */
export async function logTouchAction(
  opportunityId: string,
  input: unknown,
): Promise<ActivityRecord> {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const parsed = activityCreateSchema.parse(input)
  const activity = await createActivity(ctx, parsed)
  revalidatePath("/dashboard")
  revalidatePath(`/opportunities/${opportunityId}`)
  return activity
}
