"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/security/auth"
import { getOpportunityById } from "@/lib/data/opportunities"
import {
  getCustomSchedule,
  generateFlatSchedule,
  saveCustomSchedule,
} from "@/lib/data/revenue-schedule"
import {
  createCashflowMilestone,
  deleteCashflowMilestone,
  getWorkingCapitalForOpportunity,
  listCashflowMilestones,
  updateCashflowMilestone,
  type CashflowMilestoneRecord,
} from "@/lib/data/cashflow-milestones"
import {
  serializeWorkingCapital,
  type WorkingCapitalDTO,
} from "@/lib/finance/working-capital-dto"

// ORR-707 — server actions for the per-deal revenue-schedule editor. Thin wrappers
// over lib/data/revenue-schedule.ts (which stays server-only); the client editor
// never touches the data layer directly.
//
// ORR-708 — extends the P&L tab with the working-capital summary + cost-milestone
// editor. Cost milestones are cash OUTFLOWS (direction "out"); the editor never
// exposes direction, so these wrappers pin it. Revenue inflows come from the
// schedule above and are bridged in by getWorkingCapitalForOpportunity.

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

// ── Cost milestones + working capital (ORR-708) ─────────────────────────────────

/** A cost milestone as edited in the client. `direction` is implicit ("out") — the
 *  editor only manages outflows, so it is never sent from the client. */
export interface CostMilestoneInputDTO {
  label: string
  /** "YYYY-MM" or "YYYY-MM-DD"; normalised to the first of the month on write. */
  scheduledMonth: string
  amount: string
}

/** The derived working-capital position (revenue schedule netted against cost
 *  milestones), serialized for the client P&L panel. */
export async function getWorkingCapitalAction(
  opportunityId: string,
): Promise<WorkingCapitalDTO> {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const opp = await getOpportunityById(ctx, opportunityId)
  if (!opp) throw new Error("Opportunity not found.")

  const result = await getWorkingCapitalForOpportunity(opportunityId, ctx)
  return serializeWorkingCapital(result, opp.currency)
}

/** The deal's cost milestones (outflows only), in schedule order. */
export async function listCostMilestonesAction(
  opportunityId: string,
): Promise<CashflowMilestoneRecord[]> {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const all = await listCashflowMilestones(opportunityId, ctx)
  return all.filter((m) => m.direction === "out")
}

export async function createCostMilestoneAction(
  opportunityId: string,
  input: CostMilestoneInputDTO,
): Promise<CashflowMilestoneRecord> {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  const record = await createCashflowMilestone(
    opportunityId,
    { direction: "out", label: input.label, scheduledMonth: input.scheduledMonth, amount: input.amount },
    ctx,
  )
  revalidatePath(`/opportunities/${opportunityId}`)
  return record
}

export async function updateCostMilestoneAction(
  opportunityId: string,
  milestoneId: string,
  input: CostMilestoneInputDTO,
): Promise<CashflowMilestoneRecord> {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  // direction stays "out" — the editor only manages cost milestones.
  const record = await updateCashflowMilestone(
    milestoneId,
    { label: input.label, scheduledMonth: input.scheduledMonth, amount: input.amount },
    ctx,
  )
  revalidatePath(`/opportunities/${opportunityId}`)
  return record
}

export async function deleteCostMilestoneAction(
  opportunityId: string,
  milestoneId: string,
): Promise<void> {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }

  await deleteCashflowMilestone(milestoneId, ctx)
  revalidatePath(`/opportunities/${opportunityId}`)
}
