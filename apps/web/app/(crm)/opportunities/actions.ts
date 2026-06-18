"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/security/auth"
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
import { searchAccountOptions } from "@/lib/data/contacts"

export async function createOpportunityAction(input: unknown) {
  const user = await requireUser()
  const parsed = opportunityCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const opportunity = await createOpportunity(ctx, parsed)
  revalidatePath("/opportunities")
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
