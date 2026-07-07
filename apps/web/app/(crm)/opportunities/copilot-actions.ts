"use server"

import { z } from "zod"
import { requireUser } from "@/lib/security/auth"
import { getOpportunityById } from "@/lib/data/opportunities"
import { getActivitiesForOpportunity } from "@/lib/data/activities"
import { runDealCopilot, type CopilotAction, type DealCopilotResult } from "@/lib/ai/deal-copilot"

// Server actions for the AI Deal Copilot. Each runs under the authenticated user
// context, so RLS gates deal access (a user who cannot see the deal cannot
// copilot it). Generation goes through the shared aiCall seam (caps + logging).

const idSchema = z.string().uuid()

async function runCopilot(action: CopilotAction, opportunityId: unknown): Promise<DealCopilotResult> {
  const user = await requireUser()
  const id = idSchema.parse(opportunityId)
  const ctx = { user, source: "web" as const }

  // RLS-gated read: null means not found OR not visible to this user.
  const opportunity = await getOpportunityById(ctx, id)
  if (!opportunity) {
    return { ok: false, error: "Opportunity not found, or you don't have access to it." }
  }

  // getActivitiesForOpportunity returns most-recent-first; the copilot caps the
  // list itself, so pass what RLS allows.
  const activities = await getActivitiesForOpportunity(ctx, id)

  return runDealCopilot(user.id, action, opportunity, activities)
}

export async function dealCopilotSummaryAction(opportunityId: string): Promise<DealCopilotResult> {
  return runCopilot("summary", opportunityId)
}

export async function dealCopilotEmailAction(opportunityId: string): Promise<DealCopilotResult> {
  return runCopilot("email", opportunityId)
}

export async function dealCopilotNextBestActionAction(opportunityId: string): Promise<DealCopilotResult> {
  return runCopilot("next_best_action", opportunityId)
}
