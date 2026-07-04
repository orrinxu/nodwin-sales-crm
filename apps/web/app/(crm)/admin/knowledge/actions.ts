"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import { createDriveClient } from "@/lib/integrations/drive"
import { createEmbedder } from "@/lib/ai/embeddings"
import { runIngestionBatch } from "@/lib/ingestion/worker"
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

export async function runIngestionAction(
  limit = 10,
): Promise<{ processed: number; error?: string }> {
  const user = await requireUser()
  requireRole(user, "admin")

  try {
    const summary = await runIngestionBatch(
      { drive: createDriveClient(), embedder: createEmbedder() },
      limit,
    )
    revalidatePath(PATH)
    return { processed: summary.processed }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error"
    return { processed: 0, error: message }
  }
}
