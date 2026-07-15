"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/lib/security/auth"
import {
  assignDirectReport,
  removeDirectReport,
  getUserDisplayName,
} from "@/lib/data/direct-reports"
import { notifyDirectReportReassigned } from "@/lib/notifications/triggers"

export type RosterActionResult = { ok: true } | { ok: false; error: string }

const idSchema = z.string().uuid()

/**
 * Claim a sales_rep as a direct report (ORR-715). The DB RPC enforces the
 * guardrail (same entity/BU, target is a rep, actor is a manager); this action
 * best-effort notifies the losing manager on a reassignment.
 */
export async function assignDirectReportAction(reportId: unknown): Promise<RosterActionResult> {
  const user = await requireUser()
  const id = idSchema.parse(reportId)
  try {
    const { reportName, losingManagerId } = await assignDirectReport(id)
    if (losingManagerId && losingManagerId !== user.id) {
      const newManagerName = await getUserDisplayName(user.id)
      await notifyDirectReportReassigned({
        losingManagerId,
        reportName: reportName ?? "A team member",
        newManagerName,
      })
    }
    revalidatePath("/direct-reports")
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg.includes("already your direct report")) {
      return { ok: false, error: "They already report to you." }
    }
    if (msg.includes("not authorised")) {
      return { ok: false, error: "You can only manage sales reps in your own entity and business unit." }
    }
    return { ok: false, error: "Couldn't update the roster. Please try again." }
  }
}

/** Release a direct report (set their manager to none). */
export async function removeDirectReportAction(reportId: unknown): Promise<RosterActionResult> {
  await requireUser()
  const id = idSchema.parse(reportId)
  try {
    await removeDirectReport(id)
    revalidatePath("/direct-reports")
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg.includes("not your direct report")) {
      return { ok: false, error: "They no longer report to you." }
    }
    return { ok: false, error: "Couldn't update the roster. Please try again." }
  }
}
