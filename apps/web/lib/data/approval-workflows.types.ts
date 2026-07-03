// Shared constants + types for approval workflows. Kept out of the server-only
// data module so client components (the admin editor) can import the option
// lists and interfaces without pulling server code into the client bundle.

// Roles that can sensibly be an approver on a workflow step.
export const APPROVER_ROLE_OPTIONS = [
  "sales_manager",
  "regional_head",
  "group_sales_lead",
  "finance",
  "ops",
  "exec",
  "admin",
] as const

// Entity types an approval workflow can target. Only 'opportunity' has a submit
// path today; add others here as their submit paths land (avoids inert config).
export const WORKFLOW_ENTITY_TYPES = ["opportunity"] as const

// Deal stages — the opportunity pipeline stages that can trigger an approval.
export const DEAL_STAGE_OPTIONS = [
  "qualify",
  "meet_and_present",
  "propose",
  "negotiate",
  "verbal_agreement",
  "closed_won",
  "closed_lost",
] as const

export const APPROVAL_STEP_MODE_OPTIONS = [
  "all_required",
  "any_one",
] as const

// How a step's approver is resolved: the submitter's own manager (at submit
// time), a specific person (e.g. CFO/COO/CEO), or an entity-scoped role.
export type ApproverKind = "manager" | "user" | "role"

export type ApprovalStepMode = (typeof APPROVAL_STEP_MODE_OPTIONS)[number]

export interface AdminWorkflowStep {
  stepOrder: number
  approverKind: ApproverKind
  approverRole: string | null
  approverUserId: string | null
  approverUserIds: string[] | null
  approverName: string | null
  name: string | null
  mode: ApprovalStepMode
}

export interface AdminApprovalWorkflow {
  id: string
  name: string
  description: string | null
  entityType: string
  entityId: string | null
  entityName: string | null
  appliesToEntityId: string | null
  appliesToEntityName: string | null
  triggerStage: string | null
  enforceGate: boolean
  active: boolean
  steps: AdminWorkflowStep[]
}
