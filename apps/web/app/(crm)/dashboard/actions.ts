"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/security/auth"
import {
  createActivity,
  activityCreateSchema,
  type ActivityRecord,
} from "@/lib/data/activities"
import { createTask, setTaskStatus, taskCreateSchema } from "@/lib/data/tasks"

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

// ── Tasks (ORR-725) ──────────────────────────────────────────────────────────

export async function createTaskAction(input: unknown) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const parsed = taskCreateSchema.parse(input)
  const task = await createTask(ctx, parsed)
  revalidatePath("/dashboard")
  return task
}

export async function completeTaskAction(id: string) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  await setTaskStatus(ctx, id, "done")
  revalidatePath("/dashboard")
}
