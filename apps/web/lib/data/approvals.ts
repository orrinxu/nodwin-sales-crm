import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { getNextStage } from "@/lib/opportunity"
import type { DealStage } from "@/lib/opportunity"
import type {
  ApprovalStep,
  ApprovalContext,
  StepApproval,
  StepAction,
} from "@/lib/workflows/approval"
import {
  getApprovalStepState,
  checkCanTransitionToApproved,
} from "@/lib/workflows/approval"

export interface ApprovalCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export type ApprovalInstanceStatus = "pending" | "approved" | "rejected" | "cancelled"
export type ApprovalStepStatus = "pending" | "approved" | "rejected" | "skipped"
export type ApprovalDecisionType = "approved" | "rejected" | "skipped"

export interface ApprovalDecisionRecord {
  id: string
  decision: ApprovalDecisionType
  comment: string | null
  createdAt: string
  decidedByName: string | null
}

export interface ApprovalStepRecord {
  id: string
  stepOrder: number
  approverRole: string | null
  approverUserId: string | null
  approverName: string | null
  approverUserIds: string[] | null
  approverNames: string[] | null
  mode: string | null
  name: string | null
  status: ApprovalStepStatus
  dueBy: string | null
  decisions: ApprovalDecisionRecord[]
}

export interface ApprovalInstanceRecord {
  id: string
  workflowName: string | null
  status: ApprovalInstanceStatus
  triggeredByName: string | null
  createdAt: string
  steps: ApprovalStepRecord[]
}

// "not_submitted" means no approval instance exists for the opportunity yet.
export type ApprovalSummaryStatus = ApprovalInstanceStatus | "not_submitted"

const APPROVAL_STATUS_LABELS: Record<ApprovalSummaryStatus, string> = {
  not_submitted: "Not submitted",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
}

export function approvalStatusLabel(status: ApprovalSummaryStatus): string {
  // eslint-disable-next-line security/detect-object-injection -- status is a constrained union, not user input
  return APPROVAL_STATUS_LABELS[status]
}

// The latest instance (instances come back newest-first) determines the headline
// approval status shown on the opportunity; no instance → not yet submitted.
export function summarizeApprovalStatus(
  instances: ApprovalInstanceRecord[],
): ApprovalSummaryStatus {
  return instances[0]?.status ?? "not_submitted"
}

// ── xState bridge (ORR-641) ───────────────────────────────────────────────────

// Build an xState ApprovalContext from the latest approval instance for an
// opportunity. Returns null if no pending/completed instance exists.
export function hydrateMachineContext(
  instances: ApprovalInstanceRecord[],
): ApprovalContext | null {
  const instance = instances[0]
  if (!instance) return null

  // Map DB step_order (1-based, contiguous) to the step id the machine expects.
  // The machine uses step id (1, 2, …) matching the step_order.
  const steps: ApprovalStep[] = instance.steps.map((s) => ({
    id: s.stepOrder,
    stepNumber: s.stepOrder,
    approvers: buildApproverListForStep(s),
    mode: (s.mode === "any_one" ? "any_one" : "all_required") as "any_one" | "all_required",
  }))

  const stepApprovals: Record<number, StepApproval> = {}
  for (const s of instance.steps) {
    const decisions = s.decisions ?? []
    const votes: Record<string, { approved: boolean; rejected: boolean }> = {}
    let approved = false
    let rejected = false
    let skipped = false

    for (const d of decisions) {
      const approverIds = s.approverUserIds ?? (s.approverUserId ? [s.approverUserId] : [])
      for (const approverId of approverIds) {
        if (d.decidedByName) {
          if (d.decision === "approved") {
            votes[approverId] = { approved: true, rejected: false }
          } else if (d.decision === "rejected") {
            votes[approverId] = { approved: false, rejected: true }
          }
        }
      }
    }

    if (s.status === "approved") approved = true
    else if (s.status === "rejected") rejected = true
    else if (s.status === "skipped") skipped = true

    stepApprovals[s.stepOrder] = { approved, rejected, skipped, votes }
  }

  const currentStepIndex = instance.steps.findIndex((s) => s.status === "pending")
  const currentStepNumber = currentStepIndex >= 0
    ? instance.steps[currentStepIndex].stepOrder
    : instance.steps.length

  return {
    steps,
    stepApprovals,
    currentStepIndex: currentStepNumber,
    reason: undefined,
  }
}

function buildApproverListForStep(
  step: ApprovalStepRecord,
): { id: string; name: string }[] {
  const list: { id: string; name: string }[] = []
  if (step.approverUserId) {
    list.push({ id: step.approverUserId, name: step.approverName ?? step.approverUserId })
  }
  if (step.approverUserIds) {
    for (let i = 0; i < step.approverUserIds.length; i++) {
      const uid = step.approverUserIds[i]
      if (!list.some((a) => a.id === uid)) {
        const name = step.approverNames?.[i] ?? uid
        list.push({ id: uid, name })
      }
    }
  }
  return list
}

// Compute per-step UI state from a hydrated machine context.
export function computeApprovalStepStates(
  context: ApprovalContext,
): Record<number, { stepState: "pending" | "approved" | "rejected" | "skipped"; canApprove: boolean; canReject: boolean; canSkip: boolean }> {
  const result: Record<number, ReturnType<typeof getApprovalStepState>> = {}
  for (const step of context.steps) {
    result[step.id] = getApprovalStepState(step.id, context.stepApprovals)
  }
  return result
}

// Check whether the approval is fully resolved (all steps approved).
export function isApprovalFullyApproved(
  context: ApprovalContext,
): boolean {
  return checkCanTransitionToApproved(context.stepApprovals)
}

const APPROVAL_SELECT = `
  id,
  workflow_id,
  status,
  triggered_by_user_id,
  created_at,
  workflow:workflow_id ( name ),
  triggered_by:triggered_by_user_id ( full_name ),
  steps:approval_steps (
    id,
    step_order,
    approver_role,
    approver_user_id,
    approver_user_ids,
    mode,
    name,
    status,
    due_by,
    approver:approver_user_id ( full_name ),
    decisions:approval_decisions (
      id,
      decision,
      comment,
      created_at,
      decided_by:decided_by_user_id ( full_name )
    )
  )
`

function toDecisionRecord(data: Record<string, unknown>): ApprovalDecisionRecord {
  const decidedBy = data.decided_by as { full_name: string } | null
  return {
    id: data.id as string,
    decision: data.decision as ApprovalDecisionType,
    comment: (data.comment as string) ?? null,
    createdAt: data.created_at as string,
    decidedByName: decidedBy?.full_name ?? null,
  }
}

function toStepRecord(data: Record<string, unknown>): ApprovalStepRecord {
  const approver = data.approver as { full_name: string } | null
  const decisions = (data.decisions ?? []) as Record<string, unknown>[]
  const approverUserIds = (data.approver_user_ids as string[] | null) ?? null
  return {
    id: data.id as string,
    stepOrder: data.step_order as number,
    approverRole: (data.approver_role as string) ?? null,
    approverUserId: (data.approver_user_id as string) ?? null,
    approverName: approver?.full_name ?? null,
    approverUserIds,
    approverNames: null, // resolved in getApprovalHistoryForOpportunity
    mode: (data.mode as string) ?? null,
    name: (data.name as string) ?? null,
    status: data.status as ApprovalStepStatus,
    dueBy: (data.due_by as string) ?? null,
    decisions: decisions
      .map(toDecisionRecord)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }
}

function toInstanceRecord(data: Record<string, unknown>): ApprovalInstanceRecord {
  const workflow = data.workflow as { name: string } | null
  const triggeredBy = data.triggered_by as { full_name: string } | null
  const steps = (data.steps ?? []) as Record<string, unknown>[]
  return {
    id: data.id as string,
    workflowName: workflow?.name ?? null,
    status: data.status as ApprovalInstanceStatus,
    triggeredByName: triggeredBy?.full_name ?? null,
    createdAt: data.created_at as string,
    steps: steps
      .map(toStepRecord)
      .sort((a, b) => a.stepOrder - b.stepOrder),
  }
}

// Read-only approval history for an opportunity. Uses the authenticated client,
// so RLS scopes results to what the viewer may see (the instance triggerer,
// a named approver, or an admin — see approval_instances_select_scoped).
export async function getApprovalHistoryForOpportunity(
  ctx: ApprovalCallContext,
  opportunityId: string,
): Promise<ApprovalInstanceRecord[]> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("approval_instances")
    .select(APPROVAL_SELECT)
    .eq("entity_type", "opportunity")
    .eq("entity_id", opportunityId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to load approval history: ${error.message}`)
  }

  const instances = (data ?? []).map((r) => toInstanceRecord(r as Record<string, unknown>))

  // Resolve multi-approver names: collect all unique user IDs from all steps
  // then batch-lookup names and attach to each step record.
  const allUserIds = new Set<string>()
  for (const inst of instances) {
    for (const step of inst.steps) {
      if (step.approverUserIds) {
        for (const uid of step.approverUserIds) {
          allUserIds.add(uid)
        }
      }
    }
  }

  if (allUserIds.size > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name")
      .in("id", Array.from(allUserIds))

    const nameMap = new Map<string, string>()
    for (const u of (users ?? []) as { id: string; full_name: string | null }[]) {
      if (u.full_name) nameMap.set(u.id, u.full_name)
    }

    for (const inst of instances) {
      for (const step of inst.steps) {
        if (step.approverUserIds) {
          step.approverNames = step.approverUserIds.map(
            (uid) => nameMap.get(uid) ?? uid,
          )
        }
      }
    }
  }

  return instances
}

// ── Write path (ORR-604) ─────────────────────────────────────────────────────
// Both writes go through SECURITY DEFINER RPCs: approval_instances/steps are
// admin-only under RLS, so the RPCs perform the writes with explicit
// authorisation (see 20260703340000).

export async function submitOpportunityForApproval(
  ctx: ApprovalCallContext,
  opportunityId: string,
): Promise<string> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc("submit_opportunity_for_approval", {
    _opportunity_id: opportunityId,
  })
  if (error) {
    throw new Error(`Failed to submit for approval: ${error.message}`)
  }
  return data as string
}

export async function recordApprovalDecision(
  ctx: ApprovalCallContext,
  stepId: string,
  decision: ApprovalDecisionType,
  comment?: string | null,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase.rpc("record_approval_decision", {
    _step_id: stepId,
    _decision: decision,
    _comment: comment ?? undefined,
  })
  if (error) {
    throw new Error(`Failed to record decision: ${error.message}`)
  }
}

export async function reassignApprovalStep(
  ctx: ApprovalCallContext,
  stepId: string,
  newUserId: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase.rpc("reassign_approval_step", {
    _step_id: stepId,
    _new_user_id: newUserId,
  })
  if (error) {
    throw new Error(`Failed to reassign approval: ${error.message}`)
  }
}

export async function cancelApprovalInstance(
  ctx: ApprovalCallContext,
  instanceId: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase.rpc("cancel_approval_instance", {
    _instance_id: instanceId,
  })
  if (error) {
    throw new Error(`Failed to cancel approval: ${error.message}`)
  }
}

// Notify whoever now owns the current pending step of an opportunity's approval
// (after a submit, an advance, or a reassignment). Resolves the approver: a named
// user directly, or — for a role step — every holder of that role in the
// opportunity's business entity (the firewalled set). Best-effort; never throws.
export async function notifyCurrentApprover(opportunityId: string): Promise<void> {
  try {
    const supabase = await createServerClient()

    const { data: inst } = await supabase
      .from("approval_instances")
      .select("id, business_entity_id, status")
      .eq("entity_type", "opportunity")
      .eq("entity_id", opportunityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const instance = inst as { id: string; business_entity_id: string | null; status: string } | null
    if (!instance || instance.status !== "pending") return

    const { data: steps } = await supabase
      .from("approval_steps")
      .select("step_order, approver_user_id, approver_user_ids, approver_role, status")
      .eq("instance_id", instance.id)
      .order("step_order", { ascending: true })

    type StepRow = { step_order: number; approver_user_id: string | null; approver_user_ids: string[] | null; approver_role: string | null; status: string }
    const stepRows = (steps ?? []) as StepRow[]
    if (stepRows.length === 0) return
    const current = stepRows.find((s) => s.status === "pending")
    if (!current) return

    const { data: opp } = await supabase
      .from("opportunities")
      .select("name")
      .eq("id", opportunityId)
      .maybeSingle()
    const opportunityName = (opp as { name: string } | null)?.name ?? "Opportunity"

    let approverIds: string[] = []
    if (current.approver_user_ids && current.approver_user_ids.length > 0) {
      approverIds = current.approver_user_ids
    } else if (current.approver_user_id) {
      approverIds = [current.approver_user_id]
    } else if (current.approver_role && instance.business_entity_id) {
      const { data: holders } = await supabase
        .from("users")
        .select("id")
        .eq("primary_role", current.approver_role as never)
        .eq("primary_entity_id", instance.business_entity_id)
      approverIds = ((holders ?? []) as { id: string }[]).map((h) => h.id)
    }

    if (approverIds.length === 0) return

    const { notifyApprovalRequested } = await import("../notifications/triggers")
    await Promise.allSettled(
      approverIds.map((id) =>
        notifyApprovalRequested({
          approverUserId: id,
          opportunityName,
          opportunityId,
          stepNumber: current.step_order,
          totalSteps: stepRows.length,
          entityId: instance.business_entity_id ?? undefined,
        }),
      ),
    )
  } catch (err) {
    console.error(
      `[approvals] notifyCurrentApprover failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

export interface ApprovalActionState {
  // May the current user submit this opportunity for approval right now?
  canSubmit: boolean
  // The id of the step the current user can decide right now (else null).
  actionableStepId: string | null
  // The current pending approval instance (for admin reassign/cancel), else null.
  pendingInstanceId: string | null
}

// Resolves what the current viewer can DO with an opportunity's approval:
// submit it (if not already pending and they can manage it), or decide the
// current pending step (if they are its approver by id/role, or an admin).
export async function getApprovalActionState(
  ctx: ApprovalCallContext,
  opportunityId: string,
): Promise<ApprovalActionState> {
  const supabase = await createServerClient()

  const { data: inst, error: instErr } = await supabase
    .from("approval_instances")
    .select("id, status")
    .eq("entity_type", "opportunity")
    .eq("entity_id", opportunityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (instErr) {
    throw new Error(`Failed to resolve approval state: ${instErr.message}`)
  }

  const isPending = inst?.status === "pending"

  if (!isPending) {
    const { data: canManage } = await supabase.rpc("can_manage_opportunity", {
      _opportunity_id: opportunityId,
    })
    return { canSubmit: !!canManage, actionableStepId: null, pendingInstanceId: null }
  }

  const pendingInstanceId = (inst as { id: string }).id

  // Pending: find the current (lowest-order) pending step and whether this user
  // may decide it.
  const { data: steps, error: stepErr } = await supabase
    .from("approval_steps")
    .select("id, approver_role, approver_user_id, approver_user_ids")
    .eq("instance_id", (inst as { id: string }).id)
    .eq("status", "pending")
    .order("step_order", { ascending: true })
    .limit(1)

  if (stepErr) {
    throw new Error(`Failed to resolve approval step: ${stepErr.message}`)
  }

  const current = steps?.[0] as { id: string; approver_role: string | null; approver_user_id: string | null; approver_user_ids: string[] | null } | undefined
  let actionableStepId: string | null = null
  if (current) {
    const role = ctx.user.role
    const isInMultiApprovers =
      Array.isArray(current.approver_user_ids) &&
      current.approver_user_ids.includes(ctx.user.id)
    const canDecide =
      current.approver_user_id === ctx.user.id ||
      isInMultiApprovers ||
      (!!current.approver_role && current.approver_role === role) ||
      role === "admin"
    if (canDecide) actionableStepId = current.id
  }

  return { canSubmit: false, actionableStepId, pendingInstanceId }
}

export interface EnforceGateStatus {
  isBlocked: boolean
}

export async function getEnforceGateStatus(
  ctx: ApprovalCallContext,
  opportunityId: string,
  currentStage: string,
): Promise<EnforceGateStatus> {
  void ctx
  const nextStage = getNextStage(currentStage as DealStage)
  if (!nextStage) return { isBlocked: false }

  const supabase = await createServerClient()
  const { data: isClear, error } = await supabase.rpc("opportunity_check_enforce_gate", {
    _opportunity_id: opportunityId,
    _to_stage: nextStage,
  })
  if (error) {
    console.error("Failed to check enforce gate:", error.message)
    return { isBlocked: false }
  }
  return { isBlocked: !isClear }
}
