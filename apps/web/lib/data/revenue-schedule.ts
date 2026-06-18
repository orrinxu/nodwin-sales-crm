import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { Money } from "@/lib/money"
import type { OpportunityCallContext } from "./opportunities"

export interface RevenueScheduleRow {
  id: string
  opportunityId: string
  month: string
  amount: string
  createdAt: string
  updatedAt: string
}

export interface FlatScheduleMonth {
  month: string
  amount: string
}

function getMonthsBetween(start: string, end: string): string[] {
  const startDate = new Date(start + "T00:00:00Z")
  const endDate = new Date(end + "T00:00:00Z")
  const months: string[] = []

  let current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1))
  const lastMonth = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1))

  while (current <= lastMonth) {
    const y = current.getUTCFullYear()
    const m = String(current.getUTCMonth() + 1).padStart(2, "0")
    months.push(`${y}-${m}-01`)
    current = new Date(Date.UTC(y, current.getUTCMonth() + 1, 1))
  }

  return months
}

export function generateFlatSchedule(
  amount: string,
  currency: string,
  servicePeriodStart: string,
  servicePeriodEnd: string,
): FlatScheduleMonth[] {
  const months = getMonthsBetween(servicePeriodStart, servicePeriodEnd)
  if (months.length === 0) return []

  const total = Money.fromAmount(amount, currency)
  const perMonth = total.divide(months.length, "floor")
  const remainder = total.subtract(perMonth.multiply(months.length))

  return months.map((month, i) => ({
    month,
    amount: i === months.length - 1
      ? perMonth.add(remainder).toAmount()
      : perMonth.toAmount(),
  }))
}

function toDomainScheduleRow(data: Record<string, unknown>): RevenueScheduleRow {
  return {
    id: data.id as string,
    opportunityId: data.opportunity_id as string,
    month: data.month as string,
    amount: String(data.amount ?? 0),
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export async function getRevenueSchedule(
  ctx: OpportunityCallContext,
  opportunityId: string,
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

  return (data ?? []).map(toDomainScheduleRow)
}

export const revenueScheduleInputSchema = z.object({
  months: z.array(z.object({
    month: z.string().min(1),
    amount: z.string().min(1),
  })),
})

export type RevenueScheduleInput = z.infer<typeof revenueScheduleInputSchema>

export async function saveRevenueSchedule(
  ctx: OpportunityCallContext,
  opportunityId: string,
  input: RevenueScheduleInput,
): Promise<void> {
  const parsed = revenueScheduleInputSchema.parse(input)
  const supabase = await createServerClient()

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("amount, currency")
    .eq("id", opportunityId)
    .single()

  if (!opportunity) {
    throw new Error("Opportunity not found")
  }

  const oppAmount = Money.fromAmount(String(opportunity.amount ?? 0), (opportunity.currency as string) ?? "USD")
  const scheduleSum = parsed.months.reduce(
    (sum, m) => sum.add(Money.fromAmount(m.amount, oppAmount.currency)),
    Money.zero(oppAmount.currency),
  )

  if (!scheduleSum.eq(oppAmount)) {
    throw new Error(
      `Schedule months (${scheduleSum.toAmount()}) do not sum to deal amount (${oppAmount.toAmount()})`,
    )
  }

  const { error: deleteError } = await supabase
    .from("opportunity_revenue_schedule")
    .delete()
    .eq("opportunity_id", opportunityId)

  if (deleteError) {
    throw new Error(`Failed to clear revenue schedule: ${deleteError.message}`)
  }

  if (parsed.months.length === 0) return

  const { error: insertError } = await supabase
    .from("opportunity_revenue_schedule")
    .insert(
      parsed.months.map((m) => ({
        opportunity_id: opportunityId,
        month: m.month,
        amount: m.amount,
      })),
    )

  if (insertError) {
    throw new Error(`Failed to save revenue schedule: ${insertError.message}`)
  }
}
