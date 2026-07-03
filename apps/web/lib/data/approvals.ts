import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

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
  approverName: string | null
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
  return {
    id: data.id as string,
    stepOrder: data.step_order as number,
    approverRole: (data.approver_role as string) ?? null,
    approverName: approver?.full_name ?? null,
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

  return (data ?? []).map((r) => toInstanceRecord(r as Record<string, unknown>))
}
