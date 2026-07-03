"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  createApprovalWorkflow,
  updateApprovalWorkflow,
  deleteApprovalWorkflow,
  replaceWorkflowSteps,
} from "@/lib/data/approval-workflows"
import { z } from "zod"

const idSchema = z.string().uuid()

export async function createApprovalWorkflowAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const id = await createApprovalWorkflow(ctx, input as never)
  revalidatePath("/admin/approval-workflows")
  return id
}

export async function updateApprovalWorkflowAction(id: string, input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await updateApprovalWorkflow(ctx, idSchema.parse(id), input as never)
  revalidatePath("/admin/approval-workflows")
}

export async function deleteApprovalWorkflowAction(id: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await deleteApprovalWorkflow(ctx, idSchema.parse(id))
  revalidatePath("/admin/approval-workflows")
}

export async function replaceWorkflowStepsAction(workflowId: string, input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await replaceWorkflowSteps(ctx, idSchema.parse(workflowId), input as never)
  revalidatePath("/admin/approval-workflows")
}
