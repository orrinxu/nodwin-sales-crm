"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/security/auth"
import { getOpportunityById } from "@/lib/data/opportunities"
import {
  getCustomSchedule,
  generateFlatSchedule,
  saveCustomSchedule,
} from "@/lib/data/revenue-schedule"

// ORR-707 — server actions for the per-deal revenue-schedule editor. Thin wrappers
// over lib/data/revenue-schedule.ts (which stays server-only); the client editor
// never touches the data layer directly.

export interface ScheduleMonthDTO {
  /** First-of-month, "YYYY-MM-01". */
  month: string
  amount: string
}

export interface RevenueScheduleData {
  months: ScheduleMonthDTO[]
  amount: string
  currency: string
  hasServicePeriod: boolean
  /** true = loaded from saved rows; false = a freshly generated flat template. */
  isCustom: boolean
}

// A schedule Date → "YYYY-MM-01" bucket, in UTC (the source dates are UTC-midnight
// from "YYYY-MM-DD" strings, so local formatting could slip a day).
function monthBucket(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}-01`
}

/** Load the deal's saved revenue schedule, or a flat template when none exists yet. */
export async function getRevenueScheduleAction(
  opportunityId: string,
): Promise<RevenueScheduleData> {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const opp = await getOpportunityById(ctx, opportunityId)
  if (!opp) throw new Error("Opportunity not found.")

  const hasServicePeriod = Boolean(opp.servicePeriodStart && opp.servicePeriodEnd)
  const existing = await getCustomSchedule(opportunityId, ctx)

  if (existing.length > 0) {
    return {
      months: existing.map((r) => ({ month: r.month.slice(0, 10), amount: r.amount })),
      amount: opp.amount,
      currency: opp.currency,
      hasServicePeriod,
      isCustom: true,
    }
  }

  const generated = hasServicePeriod
    ? generateFlatSchedule(
        {
          amount: opp.amount,
          currency: opp.currency,
          servicePeriodStart: opp.servicePeriodStart as string,
          servicePeriodEnd: opp.servicePeriodEnd as string,
          executionDate: opp.executionDate,
        },
        ctx,
      )
    : []

  return {
    months: generated.map((m) => ({ month: monthBucket(m.month), amount: m.amount })),
    amount: opp.amount,
    currency: opp.currency,
    hasServicePeriod,
    isCustom: false,
  }
}

/** Persist the edited schedule (atomic replace; enforces months-sum == deal amount). */
export async function saveRevenueScheduleAction(
  opportunityId: string,
  months: ScheduleMonthDTO[],
): Promise<void> {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  await saveCustomSchedule(opportunityId, months, ctx)
  revalidatePath(`/opportunities/${opportunityId}`)
}
