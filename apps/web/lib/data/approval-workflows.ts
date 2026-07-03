import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"
import { WORKFLOW_ENTITY_TYPES } from "@/lib/data/approval-workflows.types"
import type { AdminApprovalWorkflow } from "@/lib/data/approval-workflows.types"

export type { AdminApprovalWorkflow, AdminWorkflowStep } from "@/lib/data/approval-workflows.types"
export { APPROVER_ROLE_OPTIONS, WORKFLOW_ENTITY_TYPES } from "@/lib/data/approval-workflows.types"

export interface ApprovalWorkflowCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export const workflowStepInputSchema = z
  .object({
    stepOrder: z.number().int().min(1),
    approverRole: z.string().max(64).nullable().optional(),
    approverUserId: z.string().uuid().nullable().optional(),
  })
  .refine((s) => !!s.approverRole || !!s.approverUserId, {
    message: "Each step needs an approver role or a specific user",
  })

export const workflowCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(1000).nullable().optional(),
  entityType: z.enum(WORKFLOW_ENTITY_TYPES),
  entityId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
})
export const workflowUpdateSchema = workflowCreateSchema.partial()
export const replaceWorkflowStepsSchema = z.object({
  steps: z.array(workflowStepInputSchema).max(20),
})

export type WorkflowCreateInput = z.infer<typeof workflowCreateSchema>

const WORKFLOW_SELECT = `
  id, name, description, entity_type, entity_id, active,
  entity:entity_id ( name ),
  steps:approval_workflow_steps (
    step_order, approver_role, approver_user_id,
    approver:approver_user_id ( full_name )
  )
`

function toWorkflow(data: Record<string, unknown>): AdminApprovalWorkflow {
  const entity = data.entity as { name: string } | null
  const steps = (data.steps ?? []) as Record<string, unknown>[]
  return {
    id: data.id as string,
    name: data.name as string,
    description: (data.description as string) ?? null,
    entityType: data.entity_type as string,
    entityId: (data.entity_id as string) ?? null,
    entityName: entity?.name ?? null,
    active: data.active as boolean,
    steps: steps
      .map((s) => {
        const approver = s.approver as { full_name: string } | null
        return {
          stepOrder: s.step_order as number,
          approverRole: (s.approver_role as string) ?? null,
          approverUserId: (s.approver_user_id as string) ?? null,
          approverName: approver?.full_name ?? null,
        }
      })
      .sort((a, b) => a.stepOrder - b.stepOrder),
  }
}

// All workflows (RLS restricts read to admins). Newest first.
export async function getApprovalWorkflows(
  ctx: ApprovalWorkflowCallContext,
): Promise<AdminApprovalWorkflow[]> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("approval_workflows")
    .select(WORKFLOW_SELECT)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to load approval workflows: ${error.message}`)
  }
  return (data ?? []).map((r) => toWorkflow(r as Record<string, unknown>))
}

export async function createApprovalWorkflow(
  ctx: ApprovalWorkflowCallContext,
  input: WorkflowCreateInput,
): Promise<string> {
  void ctx
  const parsed = workflowCreateSchema.parse(input)
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("approval_workflows")
    .insert({
      name: parsed.name,
      description: parsed.description ?? null,
      entity_type: parsed.entityType,
      entity_id: parsed.entityId ?? null,
      active: parsed.active ?? true,
    } as never)
    .select("id")
    .single()

  if (error) {
    throw new Error(`Failed to create workflow: ${error.message}`)
  }
  return (data as { id: string }).id
}

export async function updateApprovalWorkflow(
  ctx: ApprovalWorkflowCallContext,
  id: string,
  input: z.input<typeof workflowUpdateSchema>,
): Promise<void> {
  void ctx
  const parsed = workflowUpdateSchema.parse(input)
  const supabase = await createServerClient()
  const patch: Record<string, unknown> = {}
  if (parsed.name !== undefined) patch.name = parsed.name
  if (parsed.description !== undefined) patch.description = parsed.description ?? null
  if (parsed.entityType !== undefined) patch.entity_type = parsed.entityType
  if (parsed.entityId !== undefined) patch.entity_id = parsed.entityId ?? null
  if (parsed.active !== undefined) patch.active = parsed.active

  const { error } = await supabase
    .from("approval_workflows")
    .update(patch as never)
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to update workflow: ${error.message}`)
  }
}

export async function deleteApprovalWorkflow(
  ctx: ApprovalWorkflowCallContext,
  id: string,
): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase.from("approval_workflows").delete().eq("id", id)
  if (error) {
    // approval_instances.workflow_id is ON DELETE RESTRICT, so a workflow that
    // has ever been used can't be deleted — surface that as guidance, not a raw
    // FK-violation string. Retire it via the Active toggle instead.
    if (error.code === "23503") {
      throw new Error(
        "This workflow is in use by existing approvals and can't be deleted. Set it inactive instead.",
      )
    }
    throw new Error(`Failed to delete workflow: ${error.message}`)
  }
}

// Atomic replace of a workflow's step template via the admin-only RPC.
export async function replaceWorkflowSteps(
  ctx: ApprovalWorkflowCallContext,
  workflowId: string,
  input: z.input<typeof replaceWorkflowStepsSchema>,
): Promise<void> {
  void ctx
  const { steps } = replaceWorkflowStepsSchema.parse(input)
  const supabase = await createServerClient()
  const { error } = await supabase.rpc("replace_workflow_steps", {
    _workflow_id: workflowId,
    _steps: steps.map((s) => ({
      step_order: s.stepOrder,
      approver_role: s.approverRole ?? "",
      approver_user_id: s.approverUserId ?? "",
    })),
  })
  if (error) {
    throw new Error(`Failed to save workflow steps: ${error.message}`)
  }
}
