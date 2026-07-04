import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface KnowledgeAdminCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface AISettings {
  id: string
  embeddingsEndpoint: string
  embeddingsModel: string
  embeddingsKey: string
  generationEndpoint: string
  generationModel: string
  generationKey: string
  ingestionEnabled: boolean
  searchEnabled: boolean
  createdAt: string
  updatedAt: string
}

export const aiSettingsUpdateSchema = z.object({
  embeddingsEndpoint: z.string().max(500).optional(),
  embeddingsModel: z.string().max(200).optional(),
  embeddingsKey: z.string().max(500).optional(),
  generationEndpoint: z.string().max(500).optional(),
  generationModel: z.string().max(200).optional(),
  generationKey: z.string().max(500).optional(),
  ingestionEnabled: z.boolean().optional(),
  searchEnabled: z.boolean().optional(),
})

export type AISettingsUpdateInput = z.input<typeof aiSettingsUpdateSchema>

export interface IngestionStats {
  pending: number
  indexed: number
  failed: number
}

function maskSecret(value: string): string {
  if (!value || value.length <= 4) return value
  return "*".repeat(Math.max(0, value.length - 4)) + value.slice(-4)
}

function toDomainSettings(data: Record<string, unknown>): AISettings {
  return {
    id: data.id as string,
    embeddingsEndpoint: (data.embeddings_endpoint as string) ?? "",
    embeddingsModel: (data.embeddings_model as string) ?? "",
    embeddingsKey: (data.embeddings_key as string) ?? "",
    generationEndpoint: (data.generation_endpoint as string) ?? "",
    generationModel: (data.generation_model as string) ?? "",
    generationKey: (data.generation_key as string) ?? "",
    ingestionEnabled: (data.ingestion_enabled as boolean) ?? false,
    searchEnabled: (data.search_enabled as boolean) ?? false,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  }
}

export function maskSettingsForDisplay(settings: AISettings): AISettings {
  return {
    ...settings,
    embeddingsKey: maskSecret(settings.embeddingsKey),
    generationKey: maskSecret(settings.generationKey),
  }
}

function toDbSettings(input: AISettingsUpdateInput): Record<string, unknown> {
  const db: Record<string, unknown> = {}
  if (input.embeddingsEndpoint !== undefined) db.embeddings_endpoint = input.embeddingsEndpoint
  if (input.embeddingsModel !== undefined) db.embeddings_model = input.embeddingsModel
  if (input.embeddingsKey !== undefined) db.embeddings_key = input.embeddingsKey
  if (input.generationEndpoint !== undefined) db.generation_endpoint = input.generationEndpoint
  if (input.generationModel !== undefined) db.generation_model = input.generationModel
  if (input.generationKey !== undefined) db.generation_key = input.generationKey
  if (input.ingestionEnabled !== undefined) db.ingestion_enabled = input.ingestionEnabled
  if (input.searchEnabled !== undefined) db.search_enabled = input.searchEnabled
  return db
}

type AnySupabase = Awaited<ReturnType<typeof createServerClient>>

function settingsQuery(supabase: AnySupabase) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("ai_settings")
}

function ingestionQueueQuery(supabase: AnySupabase) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("ingestion_queue")
}

export async function getAISettings(ctx: KnowledgeAdminCallContext): Promise<AISettings | null> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await settingsQuery(supabase).select("*").limit(1).single()

  if (error) {
    if (error.code === "PGRST116") return null
    throw new Error(`Failed to load AI settings: ${error.message}`)
  }

  return toDomainSettings(data as Record<string, unknown>)
}

export async function updateAISettings(
  ctx: KnowledgeAdminCallContext,
  id: string,
  input: AISettingsUpdateInput,
): Promise<AISettings> {
  const parsed = aiSettingsUpdateSchema.parse(input)
  const supabase = await createServerClient()

  const dbData = toDbSettings(parsed)

  if (Object.keys(dbData).length === 0) {
    const settings = await getAISettings(ctx)
    if (!settings) throw new Error("AI settings not found")
    return settings
  }

  const { error } = await settingsQuery(supabase).update(dbData).eq("id", id)

  if (error) {
    throw new Error(`Failed to update AI settings: ${error.message}`)
  }

  const updated = await getAISettings(ctx)
  if (!updated) throw new Error("AI settings not found after update")
  return updated
}

export async function getOrCreateAISettings(ctx: KnowledgeAdminCallContext): Promise<AISettings> {
  void ctx
  const supabase = await createServerClient()

  const existing = await getAISettings(ctx)
  if (existing) return existing

  const { data, error } = await settingsQuery(supabase).insert({}).select("*").single()

  if (error) {
    throw new Error(`Failed to create AI settings: ${error.message}`)
  }

  return toDomainSettings(data as Record<string, unknown>)
}

export async function getIngestionStats(ctx: KnowledgeAdminCallContext): Promise<IngestionStats> {
  void ctx
  const supabase = await createServerClient()

  const { data, error } = await ingestionQueueQuery(supabase).select("status")

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { pending: 0, indexed: 0, failed: 0 }
    }
    throw new Error(`Failed to load ingestion stats: ${error.message}`)
  }

  const rows = data as { status: string }[] | null
  const pending = (rows ?? []).filter((r) => r.status === "pending").length
  const indexed = (rows ?? []).filter((r) => r.status === "indexed").length
  const failed = (rows ?? []).filter((r) => r.status === "failed").length

  return { pending, indexed, failed }
}
