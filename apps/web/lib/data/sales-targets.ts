import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { resolveReportingCurrency, fetchAndConvert, type DashboardContext } from "@/lib/data/metrics"
import { quarterOf, quarterBounds, quarterLabel } from "@/lib/sales/quarter"

/**
 * Per-rep quarterly sales targets (ORR-726). A closed-won revenue quota per rep
 * per calendar quarter; the dashboard shows won + weighted-pipeline against it.
 */

export interface SalesTargetsCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface UserTarget {
  userId: string
  userName: string
  amount: string | null
  currency: string
}

export interface TargetProgress {
  hasTarget: boolean
  year: number
  quarter: number
  quarterLabel: string
  currency: string
  targetAmount: number
  wonAmount: number
  weightedAmount: number
  /** won / target × 100, or null when there's no target. */
  attainmentPct: number | null
}

export const setTargetsSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  quarter: z.number().int().min(1).max(4),
  currency: z.string().max(10).optional(),
  targets: z.array(
    z.object({
      userId: z.string().uuid(),
      // Decimal string; empty/undefined clears the target for that rep.
      amount: z.string().max(30).optional().or(z.literal("")),
    }),
  ),
})
export type SetTargetsInput = z.input<typeof setTargetsSchema>

/** Admin: every active user's target for a quarter (blank where unset). */
export async function getTargetsForQuarter(
  ctx: SalesTargetsCallContext,
  year: number,
  quarter: number,
): Promise<UserTarget[]> {
  void ctx
  const supabase = await createServerClient()

  const [{ data: users, error: uErr }, { data: targets, error: tErr }] = await Promise.all([
    supabase.from("users").select("id, full_name").order("full_name", { ascending: true }),
    supabase.from("sales_targets").select("user_id, target_amount, currency").eq("year", year).eq("quarter", quarter),
  ])
  if (uErr) throw new Error(`Failed to load users: ${uErr.message}`)
  if (tErr) throw new Error(`Failed to load targets: ${tErr.message}`)

  const byUser = new Map<string, { amount: string; currency: string }>()
  for (const t of targets ?? []) {
    byUser.set(t.user_id as string, {
      amount: String(t.target_amount),
      currency: t.currency as string,
    })
  }
  return (users ?? []).map((u) => {
    const t = byUser.get(u.id as string)
    return {
      userId: u.id as string,
      userName: (u.full_name as string) ?? "—",
      amount: t?.amount ?? null,
      currency: t?.currency ?? "USD",
    }
  })
}

/** Admin: upsert a quarter's targets. A blank amount clears that rep's target. */
export async function setTargetsForQuarter(
  ctx: SalesTargetsCallContext,
  input: SetTargetsInput,
): Promise<void> {
  const parsed = setTargetsSchema.parse(input)
  const supabase = await createServerClient()
  const currency = parsed.currency || "USD"

  const toUpsert: Record<string, unknown>[] = []
  const toClear: string[] = []
  for (const t of parsed.targets) {
    if (t.amount && t.amount.trim() !== "") {
      toUpsert.push({
        user_id: t.userId,
        year: parsed.year,
        quarter: parsed.quarter,
        target_amount: t.amount,
        currency,
        created_by: ctx.user.id,
      })
    } else {
      toClear.push(t.userId)
    }
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("sales_targets")
      .upsert(toUpsert as never, { onConflict: "user_id,year,quarter" })
    if (error) throw new Error(`Failed to save targets: ${error.message}`)
  }
  if (toClear.length > 0) {
    const { error } = await supabase
      .from("sales_targets")
      .delete()
      .eq("year", parsed.year)
      .eq("quarter", parsed.quarter)
      .in("user_id", toClear)
    if (error) throw new Error(`Failed to clear targets: ${error.message}`)
  }
}

type OppRow = { stage: string; amount: number | null; currency: string; close_date?: string | null; probability_pct?: number | string | null }

/** The current-quarter target progress for the calling rep (own deals). */
export async function getMyTargetProgress(ctx: DashboardContext): Promise<TargetProgress> {
  const supabase = await createServerClient()
  const reportingCurrency = await resolveReportingCurrency(ctx)
  const { year, quarter } = quarterOf(new Date())
  const { startIso, endIso } = quarterBounds(year, quarter)

  const [{ data: targetRow }, { data: wonRows }, { data: openRows }] = await Promise.all([
    supabase
      .from("sales_targets")
      .select("target_amount, currency")
      .eq("user_id", ctx.user.id)
      .eq("year", year)
      .eq("quarter", quarter)
      .maybeSingle(),
    supabase
      .from("opportunities")
      .select("stage, amount, currency, close_date")
      .eq("owner_user_id", ctx.user.id)
      .eq("stage", "closed_won")
      .gte("close_date", startIso)
      .lte("close_date", endIso),
    supabase
      .from("opportunities")
      .select("stage, amount, currency, close_date, probability_pct")
      .eq("owner_user_id", ctx.user.id)
      .not("stage", "in", "(closed_won,closed_lost)")
      .gte("close_date", startIso)
      .lte("close_date", endIso),
  ])

  // These are DISPLAY aggregates of amounts already FX-converted to the reporting
  // currency by fetchAndConvert (bigint-safe) — not arithmetic on stored money.
  const { converted: wonConv } = await fetchAndConvert((wonRows ?? []) as OppRow[], reportingCurrency)
  let wonTotal = 0
  for (const r of wonConv) {
    // eslint-disable-next-line custom/no-unsafe-numeric-coercion -- summing already-converted display amounts
    wonTotal += r.amount
  }

  const { converted: openConv } = await fetchAndConvert((openRows ?? []) as OppRow[], reportingCurrency)
  let weightedTotal = 0
  for (const r of openConv) {
    const probability = Number((r as OppRow).probability_pct ?? 0) / 100
    // eslint-disable-next-line custom/no-unsafe-numeric-coercion -- weighting an already-converted display amount
    weightedTotal += r.amount * probability
  }

  let targetAmount = 0
  if (targetRow) {
    // eslint-disable-next-line custom/no-unsafe-numeric-coercion -- coerced only to feed the bigint-safe fetchAndConvert (same as metrics.ts)
    const rawTarget = Number(targetRow.target_amount)
    const { converted } = await fetchAndConvert(
      [{ stage: "target", amount: rawTarget, currency: targetRow.currency as string }] as OppRow[],
      reportingCurrency,
    )
    targetAmount = converted[0]?.amount ?? 0
  }

  let attainmentPct: number | null = null
  if (targetRow && targetAmount > 0) {
    // eslint-disable-next-line custom/no-unsafe-numeric-coercion -- attainment % of display totals
    attainmentPct = (wonTotal / targetAmount) * 100
  }

  return {
    hasTarget: !!targetRow,
    year,
    quarter,
    quarterLabel: quarterLabel(year, quarter),
    currency: reportingCurrency,
    targetAmount,
    wonAmount: wonTotal,
    weightedAmount: weightedTotal,
    attainmentPct,
  }
}
