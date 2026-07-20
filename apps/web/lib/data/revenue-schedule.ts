import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { OpportunityCallContext } from "./opportunities"
import { Money } from "@/lib/money"

export interface ScheduleMonth {
  month: Date
  amount: string
}

export interface ScheduleOpportunityInput {
  amount: string
  currency: string
  servicePeriodStart: string
  servicePeriodEnd: string
  executionDate?: string | null
}

// Month arithmetic runs on integer (year, month) pairs in UTC (ORR-814d) — never
// Date.setMonth, which overflows short months (Jan 31 +1 → Mar, skipping Feb, and
// two later entries then collide on the same month, TZ-independently corrupting the
// revenue curve and tripping the unique (opportunity, month) constraint). Reading UTC
// components throughout also stops a west-of-UTC server from shifting the whole
// schedule a month vs monthBucket (which buckets by getUTCMonth).
function monthsBetween(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1
  )
}

// The n-th month from `start`, as a UTC-midnight first-of-month date. n === 0 returns
// `start` unchanged so an execution-date anchor keeps its exact day; later months are
// normalized to the 1st (only the year/month is meaningful — the caller buckets by month).
function nthMonth(start: Date, n: number): Date {
  if (n === 0) return start
  const total = start.getUTCFullYear() * 12 + start.getUTCMonth() + n
  const year = Math.floor(total / 12)
  const month0 = total - year * 12
  return new Date(Date.UTC(year, month0, 1))
}

export function generateFlatSchedule(
  opportunity: ScheduleOpportunityInput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx: OpportunityCallContext,
): ScheduleMonth[] {
  const currency = opportunity.currency
  const total = Money.fromAmount(opportunity.amount, currency)

  const start = new Date(opportunity.servicePeriodStart)
  const end = new Date(opportunity.servicePeriodEnd)

  let effectiveStart = start
  if (opportunity.executionDate) {
    const exec = new Date(opportunity.executionDate)
    if (exec > start) {
      effectiveStart = exec
    }
  }

  const monthCount = monthsBetween(effectiveStart, end)
  if (monthCount < 1) {
    return []
  }

  const totalCents = total.cents
  const monthlyCents = totalCents >= 0
    ? Math.floor(totalCents / monthCount)
    : Math.ceil(totalCents / monthCount)

  const remainder = totalCents - monthlyCents * (monthCount - 1)

  const schedule: ScheduleMonth[] = []
  for (let i = 0; i < monthCount; i++) {
    const cents = i === monthCount - 1 ? remainder : monthlyCents
    schedule.push({
      month: nthMonth(effectiveStart, i),
      amount: Money.fromCents(cents, currency).toAmount(),
    })
  }

  return schedule
}

export interface RevenueScheduleRow {
  id: string
  opportunityId: string
  month: string
  amount: string
  createdAt: string
  updatedAt: string
}

export async function getCustomSchedule(
  opportunityId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx: OpportunityCallContext,
): Promise<RevenueScheduleRow[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("opportunity_revenue_schedule")
    .select("id, opportunity_id, month, amount, created_at, updated_at")
    .eq("opportunity_id", opportunityId)
    .order("month", { ascending: true })

  if (error) {
    throw new Error(`Failed to load revenue schedule: ${error.message}`)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    opportunityId: r.opportunity_id as string,
    month: r.month as string,
    amount: String(r.amount ?? "0"),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }))
}

const monthSchema = z.object({
  month: z.string().min(1, "Month is required"),
  amount: z.string().min(1, "Amount is required"),
})

export const saveCustomScheduleSchema = z.object({
  months: z.array(monthSchema),
})

export async function saveCustomSchedule(
  opportunityId: string,
  months: { month: string; amount: string }[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx: OpportunityCallContext,
): Promise<void> {
  const parsed = saveCustomScheduleSchema.parse({ months })

  const supabase = await createServerClient()

  const { data: opp, error: oppError } = await supabase
    .from("opportunities")
    .select("amount, currency")
    .eq("id", opportunityId)
    .single()

  if (oppError || !opp) {
    throw new Error(`Opportunity not found for schedule validation: ${oppError?.message ?? "not found"}`)
  }

  const currency = (opp.currency as string) ?? "USD"
  const total = Money.fromAmount(String(opp.amount ?? 0), currency)
  const scheduleTotal = parsed.months.reduce((sum, m) => {
    return sum.add(Money.fromAmount(m.amount, currency))
  }, Money.zero(currency))

  if (!scheduleTotal.eq(total)) {
    throw new Error(
      `Schedule months sum (${scheduleTotal.toAmount()}) does not match opportunity amount (${total.toAmount()})`,
    )
  }

  // Replace the whole schedule atomically. Doing DELETE + INSERT as two
  // supabase-js calls is NOT atomic: if the insert fails after the delete
  // commits, the opportunity is left with zero schedule rows — silent data loss
  // (GH #148). replace_revenue_schedule does both in ONE transaction, authorises
  // via can_access_opportunity_schedule, and locks the opportunity row so
  // concurrent replaces are last-write-wins. An empty array clears the schedule.
  const rows = parsed.months.map((m) => ({
    month: m.month,
    amount: Money.fromAmount(m.amount, currency).toAmount(),
  }))

  const { error } = await supabase.rpc("replace_revenue_schedule", {
    _opportunity_id: opportunityId,
    _rows: rows,
  })

  if (error) {
    throw new Error(`Failed to save revenue schedule: ${error.message}`)
  }
}
