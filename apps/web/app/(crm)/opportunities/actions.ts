"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/security/auth"
import {
  createOpportunity,
  updateOpportunityStage,
  opportunityCreateSchema,
  opportunityStageUpdateSchema,
} from "@/lib/data/opportunities"

export async function createOpportunityAction(input: unknown) {
  const user = await requireUser()
  const parsed = opportunityCreateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const opportunity = await createOpportunity(ctx, parsed)
  revalidatePath("/opportunities")
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
