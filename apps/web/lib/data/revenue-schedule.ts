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

function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
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
      month: addMonths(effectiveStart, i),
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

  const { error: deleteError } = await supabase
    .from("opportunity_revenue_schedule")
    .delete()
    .eq("opportunity_id", opportunityId)

  if (deleteError) {
    throw new Error(`Failed to replace revenue schedule: ${deleteError.message}`)
  }

  if (parsed.months.length === 0) return

  const rows = parsed.months.map((m) => ({
    opportunity_id: opportunityId,
    month: m.month,
    amount: Money.fromAmount(m.amount, currency).toAmount(),
  }))

  const { error: insertError } = await supabase
    .from("opportunity_revenue_schedule")
    .insert(rows as never)

  if (insertError) {
    throw new Error(`Failed to insert revenue schedule: ${insertError.message}`)
  }
}
