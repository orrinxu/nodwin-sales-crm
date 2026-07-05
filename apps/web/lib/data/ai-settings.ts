import "server-only"
import { z } from "zod"
import { createServerClient as createSsrClient } from "@supabase/ssr"
import { createServerClient } from "@/lib/supabase/server"
import { env } from "@/lib/security/env"
import type { Database } from "@/lib/database.types"

// ORR-634 admin-configurable AI / Knowledge settings.
//
// Config resolves DB-first (ai_settings, admin-managed) then env-fallback. The
// API keys are admin-only (RLS); the admin UI only ever sees whether each key is
// SET (masked), never its value. The worker/embeddings/generation read the real
// values via the service-role client through `resolveAiConfig`.

export type AiSettingsCallSource = "web" | "mcp" | "webhook" | "system"

export interface AiSettingsCallContext {
  user: { id: string; email?: string; role?: string }
  source: AiSettingsCallSource
}

type Db = ReturnType<typeof createSsrClient<Database>>

function serviceRoleClient(): Db {
  return createSsrClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

function firstNonEmpty(dbVal: unknown, envVal: string | undefined): string | null {
  if (typeof dbVal === "string" && dbVal.length > 0) return dbVal
  return envVal && envVal.length > 0 ? envVal : null
}

// ── Resolved config (DB-then-env) for server/worker use ───────────────────────

export interface EndpointConfig {
  baseUrl: string | null
  model: string | null
  apiKey: string | null
}

export interface ResolvedAiConfig {
  embeddings: EndpointConfig
  generation: EndpointConfig
  ingestionEnabled: boolean
  searchEnabled: boolean
}

type AiSettingsRow = Database["public"]["Tables"]["ai_settings"]["Row"]

async function readRow(supabase: Db): Promise<AiSettingsRow | null> {
  const { data } = await supabase
    .from("ai_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

/** Resolve the effective config (DB wins, env fills gaps). Reads via service role. */
export async function resolveAiConfig(): Promise<ResolvedAiConfig> {
  const row = await readRow(serviceRoleClient())
  return {
    embeddings: {
      baseUrl: firstNonEmpty(row?.embeddings_base_url, env.EMBEDDINGS_BASE_URL),
      model: firstNonEmpty(row?.embeddings_model, env.EMBEDDINGS_MODEL),
      apiKey: firstNonEmpty(row?.embeddings_api_key, env.EMBEDDINGS_API_KEY),
    },
    generation: {
      baseUrl: firstNonEmpty(row?.generation_base_url, env.GENERATION_BASE_URL),
      model: firstNonEmpty(row?.generation_model, env.GENERATION_MODEL),
      apiKey: firstNonEmpty(row?.generation_api_key, env.GENERATION_API_KEY),
    },
    ingestionEnabled: row?.ingestion_enabled ?? true,
    searchEnabled: row?.search_enabled ?? true,
  }
}

// ── Admin UI (masked safe view) ───────────────────────────────────────────────

export interface AiSettingsSafe {
  embeddingsBaseUrl: string | null
  embeddingsModel: string | null
  hasEmbeddingsApiKey: boolean
  generationBaseUrl: string | null
  generationModel: string | null
  hasGenerationApiKey: boolean
  ingestionEnabled: boolean
  searchEnabled: boolean
  /** Whether each endpoint is effectively configured (DB or env). */
  embeddingsConfigured: boolean
  generationConfigured: boolean
}

/** Safe config for the admin UI — secrets stripped. RLS restricts read to admins. */
export async function getAiSettings(ctx: AiSettingsCallContext): Promise<AiSettingsSafe> {
  void ctx
  const supabase = (await createServerClient()) as unknown as Db
  const { data, error } = await supabase
    .from("ai_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Failed to load AI settings: ${error.message}`)

  const embeddingsConfigured =
    !!firstNonEmpty(data?.embeddings_base_url, env.EMBEDDINGS_BASE_URL) &&
    !!firstNonEmpty(data?.embeddings_model, env.EMBEDDINGS_MODEL)
  const generationConfigured = !!firstNonEmpty(data?.generation_base_url, env.GENERATION_BASE_URL)

  return {
    embeddingsBaseUrl: data?.embeddings_base_url ?? null,
    embeddingsModel: data?.embeddings_model ?? null,
    hasEmbeddingsApiKey: !!data?.embeddings_api_key,
    generationBaseUrl: data?.generation_base_url ?? null,
    generationModel: data?.generation_model ?? null,
    hasGenerationApiKey: !!data?.generation_api_key,
    ingestionEnabled: data?.ingestion_enabled ?? true,
    searchEnabled: data?.search_enabled ?? true,
    embeddingsConfigured,
    generationConfigured,
  }
}

export const aiSettingsSchema = z.object({
  embeddingsBaseUrl: z.string().max(500).nullable().optional().or(z.literal("")),
  embeddingsModel: z.string().max(200).nullable().optional().or(z.literal("")),
  embeddingsApiKey: z.string().max(1000).optional(), // write-only; blank = keep existing
  generationBaseUrl: z.string().max(500).nullable().optional().or(z.literal("")),
  generationModel: z.string().max(200).nullable().optional().or(z.literal("")),
  generationApiKey: z.string().max(1000).optional(), // write-only
  ingestionEnabled: z.boolean().optional(),
  searchEnabled: z.boolean().optional(),
})
export type AiSettingsInput = z.input<typeof aiSettingsSchema>

function emptyToNull(v: string | null | undefined): string | null {
  return v && v.length > 0 ? v : null
}

/** Admin upsert (single-row config). Non-secret fields overwrite; secret keys are
 *  write-only — a blank/omitted key leaves the stored one untouched. */
export async function updateAiSettings(
  ctx: AiSettingsCallContext,
  input: AiSettingsInput,
): Promise<void> {
  const parsed = aiSettingsSchema.parse(input)
  const supabase = (await createServerClient()) as unknown as Db

  const { data: existing } = await supabase
    .from("ai_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const patch: Database["public"]["Tables"]["ai_settings"]["Update"] = {
    embeddings_base_url: emptyToNull(parsed.embeddingsBaseUrl ?? null),
    embeddings_model: emptyToNull(parsed.embeddingsModel ?? null),
    generation_base_url: emptyToNull(parsed.generationBaseUrl ?? null),
    generation_model: emptyToNull(parsed.generationModel ?? null),
    updated_by: ctx.user.id,
  }
  if (parsed.ingestionEnabled !== undefined) patch.ingestion_enabled = parsed.ingestionEnabled
  if (parsed.searchEnabled !== undefined) patch.search_enabled = parsed.searchEnabled
  if (parsed.embeddingsApiKey && parsed.embeddingsApiKey.length > 0) patch.embeddings_api_key = parsed.embeddingsApiKey
  if (parsed.generationApiKey && parsed.generationApiKey.length > 0) patch.generation_api_key = parsed.generationApiKey

  if (existing) {
    const { error } = await supabase.from("ai_settings").update(patch).eq("id", existing.id)
    if (error) throw new Error(`Failed to update AI settings: ${error.message}`)
  } else {
    const { error } = await supabase
      .from("ai_settings")
      .insert({ ...patch, created_by: ctx.user.id })
    if (error) throw new Error(`Failed to create AI settings: ${error.message}`)
  }
}

// ── Ops panel: ingestion index-status counts ──────────────────────────────────

export interface IngestionStatusCounts {
  pending: number
  indexed: number
  failed: number
  total: number
}

/** Aggregate index-status counts across all documents (admin ops view). Uses the
 *  service-role client so the counts are global, not RLS-scoped — aggregate only,
 *  no document content is exposed. */
export async function getIngestionStatusCounts(
  ctx: AiSettingsCallContext,
): Promise<IngestionStatusCounts> {
  void ctx
  const supabase = serviceRoleClient()
  const countStatus = async (status: Database["public"]["Enums"]["document_index_status"]): Promise<number> => {
    const { count, error } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("index_status", status)
    if (error) throw new Error(`Failed to count ${status} documents: ${error.message}`)
    return count ?? 0
  }
  const [pending, indexed, failed] = await Promise.all([
    countStatus("pending"),
    countStatus("indexed"),
    countStatus("failed"),
  ])
  return { pending, indexed, failed, total: pending + indexed + failed }
}
