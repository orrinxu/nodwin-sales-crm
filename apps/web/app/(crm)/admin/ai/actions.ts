"use server"

import { revalidatePath } from "next/cache"
import { requireUser, requireRole } from "@/lib/security/auth"
import { updateAiProviders } from "@/lib/data/ai-providers"
import { updateAiSettings, resolveAiConfig, retryFailedIngestion } from "@/lib/data/ai-settings"
import { runIngestionBatch } from "@/lib/ingestion/worker"
import { createDriveClient } from "@/lib/integrations/drive"
import { createEmbedder } from "@/lib/ai/embeddings"

export async function saveAiProvidersAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await updateAiProviders(ctx, input as never)
  revalidatePath("/admin/ai")
}

export async function saveAiSettingsAction(input: unknown) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  await updateAiSettings(ctx, input as never)
  revalidatePath("/admin/ai")
}

export interface RunIngestionResult {
  processed: number
  indexed: number
  failed: number
  skipped: number
  note?: string
}

/** Admin-triggered ingestion drain (the ops panel "run now" button). Runs the
 *  batch with the resolved embeddings config; if endpoints are unwired, docs
 *  come back 'failed' with a clear message (surfaced in the count). */
export async function runIngestionNowAction(): Promise<RunIngestionResult> {
  const user = await requireUser()
  requireRole(user, "admin")

  const cfg = await resolveAiConfig()
  if (!cfg.ingestionEnabled) {
    return { processed: 0, indexed: 0, failed: 0, skipped: 0, note: "Ingestion is disabled." }
  }
  const summary = await runIngestionBatch(
    { drive: createDriveClient(), embedder: createEmbedder(cfg.embeddings) },
    20,
  )
  revalidatePath("/admin/ai")
  return {
    processed: summary.processed,
    indexed: summary.results.filter((r) => r.status === "indexed").length,
    failed: summary.results.filter((r) => r.status === "failed").length,
    skipped: summary.results.filter((r) => r.status === "skipped").length,
  }
}

export interface RetryFailedResult {
  reset: number
}

/** Reset all 'failed' documents to 'pending' so the next ingestion run retries
 *  them. Use after fixing a config issue (e.g. the embeddings endpoint). */
export async function retryAllFailedAction(): Promise<RetryFailedResult> {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }
  const reset = await retryFailedIngestion(ctx)
  revalidatePath("/admin/ai")
  return { reset }
}
