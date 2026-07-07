import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { DealStage } from "@/lib/opportunity/stage"
import { NON_TERMINAL_STAGES } from "@/lib/opportunity/stage"
import { getStageLabel } from "@/lib/data/opportunities.types"
import { resolveStuckThresholds } from "./stuck-deal-settings"
import type { OpenStage, StuckThresholds } from "./stuck-deal-settings"
import type { DashboardContext } from "./metrics"

// ORR: "Needs my attention" dashboard widget. A personalised, actionable list
// for the SIGNED-IN user, split into three buckets — all scoped to the caller:
//   1. Stale    — my open opportunities gone quiet past their per-stage threshold
//                 (same staleness signal as stuck-deals: MAX(activities.created_at),
//                 never opportunities.updated_at), scoped to owner_user_id = me.
//   2. Overdue  — my open opportunities past their close_date.
//   3. Approvals— approval steps awaiting MY decision right now.
//
// Every read goes through the authenticated (RLS-bound) client, so the
// Confidential tier and all row scoping are enforced by the database, not here.
// A future "Tasks / follow-ups due" bucket needs a tasks entity first — the
// schema has no task/follow-up with a due date, so it is intentionally omitted.

/** Max rows surfaced per bucket; the true count is reported separately so the
 *  UI can show a "+N more" affordance. */
export const NEEDS_ATTENTION_LIMIT = 5

const DAY_MS = 86_400_000

export type NeedsAttentionBucketKey = "stale" | "overdue" | "approvals"

export interface NeedsAttentionItem {
  id: string
  name: string
  stage: DealStage
  stageLabel: string
  /** Human reason, e.g. "12d no activity" / "3d overdue" / "awaiting your approval". */
  reason: string
}

export interface NeedsAttentionBucket {
  items: NeedsAttentionItem[]
  /** Total matches for the bucket (may exceed items.length → "+N more"). */
  count: number
}

export interface NeedsAttentionResult {
  stale: NeedsAttentionBucket
  overdue: NeedsAttentionBucket
  approvals: NeedsAttentionBucket
  /** Grand total across all buckets — 0 means "all caught up". */
  total: number
}

type OpenOppRow = {
  id: string
  name: string
  stage: string
  close_date: string | null
  created_at: string
}

type ApprovalStepRow = {
  id: string
  step_order: number
  instance_id: string
  instance: {
    id: string
    status: string
    entity_type: string
    opportunity: { id: string; name: string; stage: string } | null
  } | null
}

function bucket(items: NeedsAttentionItem[], count: number): NeedsAttentionBucket {
  return { items: items.slice(0, NEEDS_ATTENTION_LIMIT), count }
}

/**
 * Build the three attention buckets for the current user. Each bucket is bounded
 * (top {@link NEEDS_ATTENTION_LIMIT}) with its true count reported alongside.
 */
export async function getNeedsAttention(
  ctx: DashboardContext,
): Promise<NeedsAttentionResult> {
  const supabase = await createServerClient()
  const me = ctx.user.id

  // ── My open opportunities (owner-scoped; RLS also applies) ──────────────────
  // Bounded by the caller's own ownership (typically small); a hard limit guards
  // the pathological case. Splitting these into stale/overdue in JS is safe
  // because the set is per-user, not org-wide.
  const { data: oppData, error: oppErr } = await supabase
    .from("opportunities")
    .select("id, name, stage, close_date, created_at")
    .eq("owner_user_id", me)
    .in("stage", NON_TERMINAL_STAGES)
    .limit(500)
  if (oppErr) throw new Error(`Failed to load my opportunities: ${oppErr.message}`)

  const opps = (oppData ?? []) as OpenOppRow[]

  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10)

  // ── Overdue: past close_date, still open ────────────────────────────────────
  const overdue: (NeedsAttentionItem & { daysOverdue: number })[] = []
  for (const o of opps) {
    if (o.close_date !== null && o.close_date < today) {
      const daysOverdue = Math.max(
        1,
        Math.floor((now - new Date(o.close_date).getTime()) / DAY_MS),
      )
      overdue.push({
        id: o.id,
        name: o.name,
        stage: o.stage as DealStage,
        stageLabel: getStageLabel(o.stage as DealStage),
        reason: `${daysOverdue}d overdue`,
        daysOverdue,
      })
    }
  }
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue)

  // ── Stale: quiet past the per-stage threshold ───────────────────────────────
  // Staleness = days since MAX(activities.created_at), or since the opportunity's
  // own created_at when it has no activity at all (never updated_at). Reuses the
  // SECURITY INVOKER aggregate RPC so activities RLS still applies.
  const stale: (NeedsAttentionItem & { days: number })[] = []
  if (opps.length > 0) {
    const ids = opps.map((o) => o.id)
    const { data: activityRows, error: actErr } = await supabase.rpc(
      "stuck_deal_last_activity",
      { opp_ids: ids },
    )
    if (actErr) throw new Error(`Failed to load activity recency: ${actErr.message}`)

    const lastByOpp = new Map<string, number>()
    for (const a of (activityRows ?? []) as { opportunity_id: string | null; last_activity_at: string | null }[]) {
      if (!a.opportunity_id || !a.last_activity_at) continue
      lastByOpp.set(a.opportunity_id, new Date(a.last_activity_at).getTime())
    }

    const thresholds: StuckThresholds = await resolveStuckThresholds()
    for (const o of opps) {
      const stage = o.stage as OpenStage
      // eslint-disable-next-line security/detect-object-injection -- stage is constrained to NON_TERMINAL_STAGES by the query, not user input
      const threshold = thresholds[stage]
      if (threshold === undefined) continue
      const lastMs = lastByOpp.get(o.id)
      const baselineMs = lastMs ?? new Date(o.created_at).getTime()
      const days = Math.max(0, Math.floor((now - baselineMs) / DAY_MS))
      if (days >= threshold) {
        stale.push({
          id: o.id,
          name: o.name,
          stage: o.stage as DealStage,
          stageLabel: getStageLabel(o.stage as DealStage),
          reason: `${days}d no activity`,
          days,
        })
      }
    }
    stale.sort((a, b) => b.days - a.days)
  }

  // ── Approvals awaiting me ────────────────────────────────────────────────────
  const approvals = await getApprovalsAwaitingMe(supabase, me)

  const toItem = (i: NeedsAttentionItem): NeedsAttentionItem => ({
    id: i.id,
    name: i.name,
    stage: i.stage,
    stageLabel: i.stageLabel,
    reason: i.reason,
  })
  const staleItems = stale.map(toItem)
  const overdueItems = overdue.map(toItem)

  return {
    stale: bucket(staleItems, staleItems.length),
    overdue: bucket(overdueItems, overdueItems.length),
    approvals: bucket(approvals, approvals.length),
    total: staleItems.length + overdueItems.length + approvals.length,
  }
}

/**
 * Approval steps the current user can decide right now. A step qualifies when:
 *   - it is `pending` and I am a NAMED approver (approver_user_id = me, or me is
 *     an element of approver_user_ids) — this is exactly the set RLS lets me read,
 *   - its instance is `pending` and targets an opportunity I can see (the embed is
 *     `!inner`, so a Confidential opportunity RLS hides drops the whole row), and
 *   - no earlier-order step of the same instance is still pending (the sequential
 *     "is it my turn" check, mirroring record_approval_decision's guard).
 *
 * Turn-detection uses the pending steps visible to me. For a role-based approver
 * (no named user) surfacing is deferred — that needs a firewalled role→user
 * expansion better done in a SECURITY DEFINER RPC.
 */
async function getApprovalsAwaitingMe(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  me: string,
): Promise<NeedsAttentionItem[]> {
  const { data: mineData, error: mineErr } = await supabase
    .from("approval_steps")
    .select(
      `id, step_order, instance_id,
       instance:instance_id!inner (
         id, status, entity_type,
         opportunity:opportunity_id!inner ( id, name, stage )
       )`,
    )
    .eq("status", "pending")
    .or(`approver_user_id.eq.${me},approver_user_ids.cs.{${me}}`)

  if (mineErr) throw new Error(`Failed to load approvals awaiting me: ${mineErr.message}`)

  const mine = (mineData ?? []) as unknown as ApprovalStepRow[]
  const actionable = mine.filter(
    (s) =>
      s.instance?.status === "pending" &&
      s.instance.entity_type === "opportunity" &&
      s.instance.opportunity != null,
  )
  if (actionable.length === 0) return []

  // Lowest still-pending step_order per instance (among the steps I can see).
  const instanceIds = [...new Set(actionable.map((s) => s.instance_id))]
  const { data: pendingData, error: pendErr } = await supabase
    .from("approval_steps")
    .select("instance_id, step_order")
    .eq("status", "pending")
    .in("instance_id", instanceIds)
  if (pendErr) throw new Error(`Failed to resolve current approval step: ${pendErr.message}`)

  const minOrder = new Map<string, number>()
  for (const p of (pendingData ?? []) as { instance_id: string; step_order: number }[]) {
    const prev = minOrder.get(p.instance_id)
    if (prev === undefined || p.step_order < prev) minOrder.set(p.instance_id, p.step_order)
  }

  const seenInstances = new Set<string>()
  const items: NeedsAttentionItem[] = []
  // Sort so the earliest-order actionable step per instance wins the dedupe.
  const sorted = [...actionable].sort((a, b) => a.step_order - b.step_order)
  for (const s of sorted) {
    if (seenInstances.has(s.instance_id)) continue
    if (s.step_order !== minOrder.get(s.instance_id)) continue // not my turn yet
    const opp = s.instance!.opportunity!
    seenInstances.add(s.instance_id)
    items.push({
      id: opp.id,
      name: opp.name,
      stage: opp.stage as DealStage,
      stageLabel: getStageLabel(opp.stage as DealStage),
      reason: "awaiting your approval",
    })
  }
  return items
}
