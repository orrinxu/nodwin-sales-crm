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

// Entity types an approval workflow can target (Phase 1 wires 'opportunity').
export const WORKFLOW_ENTITY_TYPES = ["opportunity", "account", "contact"] as const

export interface AdminWorkflowStep {
  stepOrder: number
  approverRole: string | null
  approverUserId: string | null
  approverName: string | null
}

export interface AdminApprovalWorkflow {
  id: string
  name: string
  description: string | null
  entityType: string
  entityId: string | null
  entityName: string | null
  active: boolean
  steps: AdminWorkflowStep[]
}
