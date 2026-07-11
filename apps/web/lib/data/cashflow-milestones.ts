import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { Money, type CurrencyCode } from "@/lib/money"
import {
  deriveWorkingCapital,
  type CashflowMilestone,
  type WorkingCapitalResult,
} from "@/lib/finance/working-capital"
import { getCostOfCashSettings } from "@/lib/data/finance-settings"
import type { OpportunityCallContext } from "./opportunities"

// RLS-backed CRUD for cash-flow milestones (SOW §4.14). A milestone is a child
// of an opportunity; RLS makes it visible/editable exactly when its parent deal
// is (with the Confidential-tier admin fence — see migration 20260711020000).
// The working-capital grid is a DERIVED view of these rows (lib/finance/
// working-capital.ts); getWorkingCapitalForOpportunity is the seam that feeds it.

const SELECT_COLUMNS =
  "id, opportunity_id, direction, label, scheduled_month, amount, currency, sort_order, created_by, created_at, updated_at"

export interface CashflowMilestoneRecord {
  id: string
  opportunityId: string
  direction: "in" | "out"
  label: string
  /** "YYYY-MM-DD", normalised to the first of the month. */
  scheduledMonth: string
  /** Non-negative decimal string; sign is carried by `direction`. */
  amount: string
  currency: string
  sortOrder: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export const cashflowMilestoneInputSchema = z.object({
  direction: z.enum(["in", "out"]),
  label: z.string().trim().min(1, "Label is required").max(200),
  scheduledMonth: z.string().min(1, "Scheduled month is required"),
  amount: z.string().min(1, "Amount is required"),
  sortOrder: z.number().int().optional(),
})
export type CashflowMilestoneInput = z.infer<typeof cashflowMilestoneInputSchema>

export const cashflowMilestoneUpdateSchema = cashflowMilestoneInputSchema.partial()
export type CashflowMilestoneUpdateInput = z.infer<typeof cashflowMilestoneUpdateSchema>

/** Normalise any "YYYY-MM" / "YYYY-MM-DD" string to the first of that month
 *  ("YYYY-MM-01"), matching the DB's monthly granularity. */
export function normalizeScheduledMonth(input: string): string {
  const month = input.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Invalid scheduled month: ${input} (expected YYYY-MM).`)
  }
  return `${month}-01`
}

/** Validate + canonicalise a non-negative amount against a currency. Throws on a
 *  negative value (the DB CHECK would reject it anyway — fail early and clearly). */
function normalizeAmount(amount: string, currency: CurrencyCode): string {
  const money = Money.fromAmount(amount, currency)
  if (money.isNegative()) {
    throw new Error(`Amount must be non-negative; sign is carried by direction. Got ${amount}.`)
  }
  return money.toAmount()
}

function mapRow(r: Record<string, unknown>): CashflowMilestoneRecord {
  const currency = (r.currency as string) ?? "USD"
  return {
    id: r.id as string,
    opportunityId: r.opportunity_id as string,
    direction: r.direction as "in" | "out",
    label: r.label as string,
    scheduledMonth: r.scheduled_month as string,
    amount: Money.fromAmount(String(r.amount ?? "0"), currency).toAmount(),
    currency,
    sortOrder: (r.sort_order as number) ?? 0,
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

/** Pure DB-record → derivation-input mapping. Exported for testing and reuse by
 *  getWorkingCapitalForOpportunity. */
export function toWorkingCapitalInput(
  milestones: CashflowMilestoneRecord[],
): CashflowMilestone[] {
  return milestones.map((m) => ({
    direction: m.direction,
    scheduledMonth: m.scheduledMonth,
    amount: m.amount,
    currency: m.currency as CurrencyCode,
  }))
}

async function fetchOpportunityMoney(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  opportunityId: string,
): Promise<{ currency: string; revenue: Money }> {
  const { data, error } = await supabase
    .from("opportunities")
    .select("amount, currency")
    .eq("id", opportunityId)
    .single()
  if (error || !data) {
    throw new Error(`Opportunity not found: ${error?.message ?? "not found"}`)
  }
  const currency = (data.currency as string) ?? "USD"
  return { currency, revenue: Money.fromAmount(String(data.amount ?? 0), currency) }
}

/** The milestones for one opportunity (RLS-scoped), in schedule order. */
export async function listCashflowMilestones(
  opportunityId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx: OpportunityCallContext,
): Promise<CashflowMilestoneRecord[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("cashflow_milestone")
    .select(SELECT_COLUMNS)
    .eq("opportunity_id", opportunityId)
    .order("scheduled_month", { ascending: true })
    .order("sort_order", { ascending: true })
  if (error) throw new Error(`Failed to load cash-flow milestones: ${error.message}`)
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

/** Add a milestone to an opportunity. Currency is inherited from the parent deal
 *  so every milestone shares the deal's currency (the derivation requires it).
 *  Runs under the caller's RLS (insert policy = on the deal, or non-confidential
 *  admin). */
export async function createCashflowMilestone(
  opportunityId: string,
  input: CashflowMilestoneInput,
  ctx: OpportunityCallContext,
): Promise<CashflowMilestoneRecord> {
  const parsed = cashflowMilestoneInputSchema.parse(input)
  const supabase = await createServerClient()
  const { currency } = await fetchOpportunityMoney(supabase, opportunityId)

  // amount is stored as a decimal string (numeric column); the generated Insert
  // type wants number, so cast via `as never` — the codebase convention for
  // money writes (see opportunities.ts createOpportunity).
  const insertData: Record<string, unknown> = {
    opportunity_id: opportunityId,
    direction: parsed.direction,
    label: parsed.label,
    scheduled_month: normalizeScheduledMonth(parsed.scheduledMonth),
    amount: normalizeAmount(parsed.amount, currency),
    currency,
    sort_order: parsed.sortOrder ?? 0,
    created_by: ctx.user.id,
  }

  const { data, error } = await supabase
    .from("cashflow_milestone")
    .insert(insertData as never)
    .select(SELECT_COLUMNS)
    .single()
  if (error || !data) {
    throw new Error(`Failed to create cash-flow milestone: ${error?.message ?? "unknown"}`)
  }
  return mapRow(data as Record<string, unknown>)
}

/** Update mutable fields of a milestone (RLS-scoped). Currency is immutable — it
 *  is tied to the parent opportunity and never changes here. */
export async function updateCashflowMilestone(
  id: string,
  input: CashflowMilestoneUpdateInput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx: OpportunityCallContext,
): Promise<CashflowMilestoneRecord> {
  const parsed = cashflowMilestoneUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const patch: Record<string, unknown> = {}
  if (parsed.direction !== undefined) patch.direction = parsed.direction
  if (parsed.label !== undefined) patch.label = parsed.label
  if (parsed.scheduledMonth !== undefined) {
    patch.scheduled_month = normalizeScheduledMonth(parsed.scheduledMonth)
  }
  if (parsed.sortOrder !== undefined) patch.sort_order = parsed.sortOrder
  if (parsed.amount !== undefined) {
    // Need the row's currency to canonicalise the amount to the right precision.
    const { data: existing, error: readErr } = await supabase
      .from("cashflow_milestone")
      .select("currency")
      .eq("id", id)
      .single()
    if (readErr || !existing) {
      throw new Error(`Cash-flow milestone not found: ${readErr?.message ?? "not found"}`)
    }
    patch.amount = normalizeAmount(parsed.amount, (existing.currency as string) ?? "USD")
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No fields to update.")
  }

  const { data, error } = await supabase
    .from("cashflow_milestone")
    .update(patch as never)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single()
  if (error || !data) {
    throw new Error(`Failed to update cash-flow milestone: ${error?.message ?? "unknown"}`)
  }
  return mapRow(data as Record<string, unknown>)
}

/** Delete a milestone (RLS-scoped). */
export async function deleteCashflowMilestone(
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx: OpportunityCallContext,
): Promise<void> {
  const supabase = await createServerClient()
  const { error } = await supabase.from("cashflow_milestone").delete().eq("id", id)
  if (error) throw new Error(`Failed to delete cash-flow milestone: ${error.message}`)
}

/** Derive the working-capital position for an opportunity from its milestones,
 *  the deal's revenue, and the group-wide cost-of-cash rate. This is the read
 *  seam that feeds the working-capital grid. Empty milestone set → a zeroed
 *  result. Throws if any milestone's currency differs from the deal's. */
export async function getWorkingCapitalForOpportunity(
  opportunityId: string,
  ctx: OpportunityCallContext,
): Promise<WorkingCapitalResult> {
  const supabase = await createServerClient()
  const { revenue } = await fetchOpportunityMoney(supabase, opportunityId)
  const [settings, milestones] = await Promise.all([
    getCostOfCashSettings(ctx),
    listCashflowMilestones(opportunityId, ctx),
  ])
  return deriveWorkingCapital(toWorkingCapitalInput(milestones), {
    annualRate: settings.annualRate,
    revenue,
  })
}
