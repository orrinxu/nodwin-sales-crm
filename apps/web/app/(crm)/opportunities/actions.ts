"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  createOpportunity,
  updateOpportunity,
  updateOpportunityStage,
  bulkUpdateOpportunityStage,
  bulkDeleteOpportunities,
  opportunityCreateSchema,
  opportunityUpdateSchema,
  opportunityStageUpdateSchema,
  bulkStageUpdateSchema,
  bulkDeleteSchema,
  opportunitySplitsUpdateSchema,
  opportunityTeamUpdateSchema,
  updateOpportunitySplits,
  updateOpportunityTeamMembers,
} from "@/lib/data/opportunities"
import {
  createActivity,
  activityCreateSchema,
} from "@/lib/data/activities"
import { searchAccountOptions, searchContactOptions, createContact, contactCreateSchema } from "@/lib/data/contacts"
import type { ContactCallContext } from "@/lib/data/contacts"
import {
  submitOpportunityForApproval,
  recordApprovalDecision,
  reassignApprovalStep,
  cancelApprovalInstance,
  notifyCurrentApprover,
  type ApprovalDecisionType,
} from "@/lib/data/approvals"
import { z } from "zod"

export async function createOpportunityAction(input: unknown) {
  const user = await requireUser()
  const parsed = opportunityCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const opportunity = await createOpportunity(ctx, parsed)
  revalidatePath("/opportunities")
  revalidatePath("/pipeline")
  return opportunity
}

export async function updateOpportunityAction(id: string, input: unknown) {
  const user = await requireUser()
  const parsed = opportunityUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const opportunity = await updateOpportunity(ctx, id, parsed)
  revalidatePath("/opportunities")
  revalidatePath(`/opportunities/${id}`)
  return opportunity
}

export async function submitOpportunityForApprovalAction(opportunityId: string) {
  const user = await requireUser()
  const id = z.string().uuid().parse(opportunityId)
  const ctx = { user, source: "web" as const }
  await submitOpportunityForApproval(ctx, id)
  await notifyCurrentApprover(id)
  revalidatePath(`/opportunities/${id}`)
}

const decisionSchema = z.object({
  stepId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "skipped"]),
  comment: z.string().max(2000).optional().or(z.literal("")),
})

export async function recordApprovalDecisionAction(opportunityId: string, input: unknown) {
  const user = await requireUser()
  const id = z.string().uuid().parse(opportunityId)
  const { stepId, decision, comment } = decisionSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await recordApprovalDecision(ctx, stepId, decision as ApprovalDecisionType, comment || null)
  // Notify the next approver if the chain advanced (no-op if it resolved).
  await notifyCurrentApprover(id)
  revalidatePath(`/opportunities/${id}`)
}

export async function reassignApprovalStepAction(
  opportunityId: string,
  input: unknown,
) {
  const user = await requireUser()
  requireRole(user, "admin")
  const id = z.string().uuid().parse(opportunityId)
  const { stepId, newUserId } = z
    .object({ stepId: z.string().uuid(), newUserId: z.string().uuid() })
    .parse(input)
  const ctx = { user, source: "web" as const }
  await reassignApprovalStep(ctx, stepId, newUserId)
  await notifyCurrentApprover(id)
  revalidatePath(`/opportunities/${id}`)
}

export async function cancelApprovalInstanceAction(opportunityId: string, instanceId: string) {
  const user = await requireUser()
  requireRole(user, "admin")
  const id = z.string().uuid().parse(opportunityId)
  const ctx = { user, source: "web" as const }
  await cancelApprovalInstance(ctx, z.string().uuid().parse(instanceId))
  revalidatePath(`/opportunities/${id}`)
}

export async function updateOpportunityStageAction(
  id: string,
  input: unknown,
) {
  const user = await requireUser()
  const parsed = opportunityStageUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const opportunity = await updateOpportunityStage(ctx, id, parsed)
  revalidatePath("/opportunities")
  revalidatePath("/pipeline")
  return opportunity
}

export async function bulkUpdateOpportunityStageAction(input: unknown) {
  const user = await requireUser()
  const parsed = bulkStageUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await bulkUpdateOpportunityStage(ctx, parsed)
  revalidatePath("/opportunities")
  revalidatePath("/pipeline")
}

export async function bulkDeleteOpportunitiesAction(input: unknown) {
  const user = await requireUser()
  const parsed = bulkDeleteSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await bulkDeleteOpportunities(ctx, parsed)
  revalidatePath("/opportunities")
  revalidatePath("/pipeline")
}

export async function updateOpportunitySplitsAction(
  id: string,
  input: unknown,
) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  await updateOpportunitySplits(ctx, id, opportunitySplitsUpdateSchema.parse(input))
  revalidatePath("/opportunities")
  revalidatePath(`/opportunities/${id}`)
}

export async function updateOpportunityTeamMembersAction(
  id: string,
  input: unknown,
) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  await updateOpportunityTeamMembers(ctx, id, opportunityTeamUpdateSchema.parse(input))
  revalidatePath("/opportunities")
  revalidatePath(`/opportunities/${id}`)
}

export async function createActivityAction(opportunityId: string, input: unknown) {
  const user = await requireUser()
  const parsed = activityCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const activity = await createActivity(ctx, parsed)
  revalidatePath(`/opportunities/${opportunityId}`)
  return activity
}

export async function searchAccountsAction(query: string) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  return searchAccountOptions(ctx, query)
}

export async function searchContactsAction(query: string, accountId?: string) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  return searchContactOptions(ctx, { query: query || undefined, accountId })
}

export async function searchUsersAction(query: string) {
  const user = await requireUser()
  const ctx: ContactCallContext = { user, source: "web" as const }
  const { searchUserOptions } = await import("@/lib/data/contacts")
  return searchUserOptions(ctx, query)
}

export async function createContactQuickAction(input: { fullName: string; email?: string; accountId?: string }) {
  const user = await requireUser()
  const parsed = contactCreateSchema.parse({
    fullName: input.fullName,
    email: input.email || undefined,
    primaryAccountId: input.accountId || undefined,
  })
  const ctx = { user, source: "web" as const }
  const contact = await createContact(ctx, parsed)
  revalidatePath("/opportunities")
  return { id: contact.id, name: contact.fullName }
}
