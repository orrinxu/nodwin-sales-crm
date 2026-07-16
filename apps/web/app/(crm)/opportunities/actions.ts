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
import { createAccount, accountCreateSchema } from "@/lib/data/accounts"
import {
  replaceOpportunityLineItems,
  setOpportunityLineItemsPricing,
  lineItemInputSchema,
} from "@/lib/data/opportunity-line-items"
import {
  submitOpportunityForApproval,
  recordApprovalDecision,
  reassignApprovalStep,
  cancelApprovalInstance,
  notifyCurrentApprover,
  type ApprovalDecisionType,
} from "@/lib/data/approvals"
import {
  saveView,
  deleteSavedView,
  saveViewInputSchema,
} from "@/lib/data/saved-views"
import { breakGlassConfidential } from "@/lib/data/break-glass"
import { notifyBreakGlass } from "@/lib/notifications/triggers"
import { z } from "zod"

const breakGlassSchema = z.object({
  opportunityId: z.string().uuid(),
  reason: z.string().trim().min(1, "A reason is required.").max(1000),
})

export type BreakGlassActionResult = { ok: true } | { ok: false; error: string }

/**
 * Break-glass into ONE specific Confidential deal (ORR-716). The DB RPC is the
 * authority (exec-only, Confidential-only, audit-logged); this action validates
 * input, then best-effort notifies the deal's named list. RPC refusals are mapped
 * to friendly messages. Never a blanket grant.
 */
export async function breakGlassConfidentialAction(
  input: unknown,
): Promise<BreakGlassActionResult> {
  const user = await requireUser()
  const { opportunityId, reason } = breakGlassSchema.parse(input)

  try {
    const result = await breakGlassConfidential(opportunityId, reason)
    // Accountability: notify the named list. Best-effort — the grant already
    // stands, so a notification failure must not surface as a grant failure.
    await notifyBreakGlass({
      opportunityId: result.opportunityId,
      opportunityName: result.opportunityName,
      actorName: user.email ?? "A founder",
      reason,
      recipientUserIds: result.notifyUserIds,
    })
    revalidatePath(`/opportunities/${opportunityId}`)
    revalidatePath("/opportunities")
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg.includes("not authorised")) {
      return { ok: false, error: "Only founders can break-glass into a Confidential deal." }
    }
    if (msg.includes("already have access")) {
      return { ok: false, error: "You already have access to this deal." }
    }
    if (msg.includes("only applies to Confidential")) {
      return { ok: false, error: "That deal isn't Confidential." }
    }
    if (msg.includes("reason is required")) {
      return { ok: false, error: "A reason is required." }
    }
    return { ok: false, error: "Couldn't grant break-glass access. Please try again." }
  }
}

export async function createOpportunityAction(input: unknown) {
  const user = await requireUser()
  const parsed = opportunityCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const opportunity = await createOpportunity(ctx, parsed)
  revalidatePath("/opportunities")
  return opportunity
}

export async function saveViewAction(input: unknown) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const parsed = saveViewInputSchema.parse(input)
  const view = await saveView(ctx, parsed)
  revalidatePath("/opportunities")
  return view
}

export async function deleteSavedViewAction(id: unknown) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const viewId = z.string().uuid().parse(id)
  await deleteSavedView(ctx, viewId)
  revalidatePath("/opportunities")
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
  return opportunity
}

export async function bulkUpdateOpportunityStageAction(input: unknown) {
  const user = await requireUser()
  const parsed = bulkStageUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await bulkUpdateOpportunityStage(ctx, parsed)
  revalidatePath("/opportunities")
}

export async function bulkDeleteOpportunitiesAction(input: unknown) {
  const user = await requireUser()
  const parsed = bulkDeleteSchema.parse(input)
  const ctx = { user, source: "web" as const }
  await bulkDeleteOpportunities(ctx, parsed)
  revalidatePath("/opportunities")
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

// Inline quick-create for the Account relation picker (ORR — creatable combobox).
// Reuses the existing createAccount data path (RLS + created_by trigger + audit);
// owner defaults to the current user. Returns the EntityOption shape the
// EntityCombobox onCreate expects.
export async function createAccountQuickAction(input: { name: string }) {
  const user = await requireUser()
  const parsed = accountCreateSchema.parse({
    name: input.name,
    accountOwnerUserId: user.id,
  })
  const ctx = { user, source: "web" as const }
  const account = await createAccount(ctx, parsed)
  revalidatePath("/opportunities")
  return { id: account.id, name: account.name }
}

const saveLineItemsSchema = z.object({
  lines: z.array(lineItemInputSchema),
  discountAmount: z.string().max(30).optional(),
  overridden: z.boolean(),
})

// ORR-751 (§D): save a deal's line items + per-deal pricing in one call. Replace
// swaps the lines (and recomputes amount); setPricing applies the discount +
// override toggle (and recomputes again) so the final amount reflects both.
export async function saveOpportunityLineItemsAction(id: string, input: unknown) {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const parsed = saveLineItemsSchema.parse(input)
  await replaceOpportunityLineItems(ctx, id, parsed.lines)
  await setOpportunityLineItemsPricing(ctx, id, {
    discountAmount: parsed.discountAmount,
    overridden: parsed.overridden,
  })
  revalidatePath("/opportunities")
  revalidatePath(`/opportunities/${id}`)
}
