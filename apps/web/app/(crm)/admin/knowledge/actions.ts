"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import {
  aiSettingsUpdateSchema,
  getOrCreateAISettings,
  updateAISettings,
  maskSettingsForDisplay,
  getIngestionStats,
  type AISettings,
  type IngestionStats,
} from "@/lib/data/knowledge-admin"

const PATH = "/admin/knowledge"

export async function getAISettingsAction(): Promise<AISettings | null> {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const settings = await getOrCreateAISettings(ctx)
  return maskSettingsForDisplay(settings)
}

export async function updateAISettingsAction(
  id: string,
  input: unknown,
): Promise<AISettings> {
  const user = await requireUser()
  requireRole(user, "admin")
  const parsed = aiSettingsUpdateSchema.parse(input)
  const ctx = { user, source: "web" as const }
  const updated = await updateAISettings(ctx, id, parsed)
  revalidatePath(PATH)
  return maskSettingsForDisplay(updated)
}

export async function getIngestionStatsAction(): Promise<IngestionStats> {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  return getIngestionStats(ctx)
}
