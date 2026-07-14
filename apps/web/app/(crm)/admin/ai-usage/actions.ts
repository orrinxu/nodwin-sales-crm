"use server"

import { requireUser, requireRole } from "@/lib/security/auth"
import { getAiUsageOverview, type AiUsageOverview } from "@/lib/data/ai-usage"

// ORR-701 — admin-gated window switch for the AI usage dashboard.
export async function loadAiUsageAction(days: number): Promise<AiUsageOverview> {
  const user = await requireUser()
  requireRole(user, "admin")
  return getAiUsageOverview({ user, source: "web" }, { days })
}
