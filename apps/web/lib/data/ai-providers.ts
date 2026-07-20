import "server-only"
import { z } from "zod"
import { createServerClient as createSsrClient } from "@supabase/ssr"
import { createServerClient } from "@/lib/supabase/server"
import { env } from "@/lib/security/env"
import type { Database } from "@/lib/database.types"
import type { AiFeature } from "@/lib/ai/types"
import { AI_FEATURE_NAMES } from "@/lib/ai/features"
import type { FeatureProviderOverrides } from "@/lib/ai/features"

// ORR-635 admin-configurable AI providers + selection (primary + fallback chain).
// ORR-674 per-feature provider override (pin a provider for one AI feature).
// Config resolves DB-first (ai_providers), env-fallback. API keys are admin-only
// (RLS); the admin UI only ever sees whether each key is SET.

export type AiProviderName =
  | "claude" | "gemini" | "kimi" | "deepseek" | "openai_compatible" | "ollama_local"

export const AI_PROVIDER_NAMES: AiProviderName[] = [
  "claude", "gemini", "kimi", "deepseek", "openai_compatible", "ollama_local",
]

// AI_FEATURE_NAMES, FEATURE_LABELS, and FeatureProviderOverrides live in the
// client-safe @/lib/ai/features module (this module is server-only). Re-exported
// for existing server-side importers.
export { AI_FEATURE_NAMES, FEATURE_LABELS } from "@/lib/ai/features"
export type { FeatureProviderOverrides } from "@/lib/ai/features"

/** Providers that need a base_url (ip:port) endpoint — the self-hosted ones. */
export const SELF_HOSTED_PROVIDERS: AiProviderName[] = ["openai_compatible", "ollama_local"]

export const PROVIDER_LABELS: Record<AiProviderName, string> = {
  claude: "Claude (Anthropic)",
  gemini: "Gemini (Google)",
  kimi: "Kimi (Moonshot)",
  deepseek: "DeepSeek",
  openai_compatible: "Self-hosted (llama.cpp / OpenAI-compatible)",
  ollama_local: "Ollama",
}

export interface AiProviderCallContext {
  user: { id: string; email?: string; role?: string }
  source: "web" | "mcp" | "webhook" | "system"
}

type Db = ReturnType<typeof createSsrClient<Database>>
type Row = Database["public"]["Tables"]["ai_providers"]["Row"]

function serviceRoleClient(): Db {
  return createSsrClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}
function firstNonEmpty(a: unknown, b: string | undefined): string | null {
  if (typeof a === "string" && a.length > 0) return a
  return b && b.length > 0 ? b : null
}
function emptyToNull(v: string | null | undefined): string | null {
  return v && v.length > 0 ? v : null
}

interface EnvCfg { baseUrl?: string; model?: string; apiKey?: string }
function envFor(p: AiProviderName): EnvCfg {
  switch (p) {
    case "claude": return { model: env.ANTHROPIC_MODEL, apiKey: env.ANTHROPIC_API_KEY }
    case "gemini": return { model: env.GEMINI_MODEL, apiKey: env.GOOGLE_API_KEY }
    case "deepseek": return { model: env.DEEPSEEK_MODEL, apiKey: env.DEEPSEEK_API_KEY }
    case "kimi": return { model: env.MOONSHOT_MODEL, apiKey: env.MOONSHOT_API_KEY }
    case "openai_compatible": return { baseUrl: env.OPENAI_COMPATIBLE_BASE_URL, model: env.OPENAI_COMPATIBLE_MODEL, apiKey: env.OPENAI_COMPATIBLE_API_KEY }
    case "ollama_local": return { baseUrl: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL }
  }
}
function isUsable(p: AiProviderName, baseUrl: string | null, apiKey: string | null): boolean {
  return SELF_HOSTED_PROVIDERS.includes(p) ? !!baseUrl : !!apiKey
}

// ── Resolved chain (server/router) ────────────────────────────────────────────

export interface ResolvedProvider {
  provider: AiProviderName
  baseUrl: string | null
  model: string | null
  apiKey: string | null
}

async function primaryProvider(supabase: Db): Promise<AiProviderName | null> {
  const { data } = await supabase
    .from("ai_settings")
    .select("primary_provider")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.primary_provider as AiProviderName) ?? null
}

/**
 * The admin-configured { feature -> provider } override map (ORR-674). Read as a
 * Map (not a plain record) so per-feature lookups don't trip object-injection
 * lint, and validated against the known feature/provider unions so a stale or
 * hand-edited jsonb value can't inject an unknown provider into the chain.
 */
async function featureOverrides(supabase: Db): Promise<Map<AiFeature, AiProviderName>> {
  const { data } = await supabase
    .from("ai_settings")
    .select("feature_provider_overrides")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const raw = (data?.feature_provider_overrides ?? {}) as Record<string, unknown>
  const map = new Map<AiFeature, AiProviderName>()
  for (const [key, value] of Object.entries(raw)) {
    const feature = AI_FEATURE_NAMES.find((f) => f === key)
    const provider = AI_PROVIDER_NAMES.find((p) => p === value)
    if (feature && provider) map.set(feature, provider)
  }
  return map
}

/**
 * The ordered provider fallback chain, resolved DB-then-env. Enabled DB
 * providers (primary first, then priority asc); if none are enabled, falls back
 * to any env-configured provider (backward compat before an admin configures).
 * Only usable providers (self-hosted need base_url, cloud need api_key) survive.
 */
export async function resolveProviderChain(feature?: AiFeature): Promise<ResolvedProvider[]> {
  const supabase = serviceRoleClient()
  const { data: rows } = await supabase.from("ai_providers").select("*")
  const byName = new Map<string, Row>((rows ?? []).map((r) => [r.provider, r]))

  const resolveOne = (p: AiProviderName): ResolvedProvider => {
    const row = byName.get(p)
    const e = envFor(p)
    return {
      provider: p,
      baseUrl: firstNonEmpty(row?.base_url, e.baseUrl),
      model: firstNonEmpty(row?.model, e.model),
      apiKey: firstNonEmpty(row?.api_key, e.apiKey),
    }
  }

  // Any provider that resolves to a usable config (DB row merged with env), in
  // the default priority order — this is the env/DB fallback set.
  const usableChain = () =>
    AI_PROVIDER_NAMES.map(resolveOne).filter((r) => isUsable(r.provider, r.baseUrl, r.apiKey))

  const enabled = AI_PROVIDER_NAMES.filter((p) => byName.get(p)?.enabled)
  let chain: AiProviderName[]
  if (enabled.length > 0) {
    chain = enabled.slice().sort((a, b) => (byName.get(a)?.priority ?? 100) - (byName.get(b)?.priority ?? 100))
    const primary = await primaryProvider(supabase)
    if (primary && chain.includes(primary)) chain = [primary, ...chain.filter((n) => n !== primary)]
  } else {
    chain = AI_PROVIDER_NAMES.filter((p) => { const e = envFor(p); return !!(e.apiKey || e.baseUrl) })
  }

  const resolved = chain.map(resolveOne).filter((r) => isUsable(r.provider, r.baseUrl, r.apiKey))
  // Availability guard: if the admin enabled providers but none are usable
  // (missing key/endpoint), don't take AI fully offline — fall back to any
  // env/DB-usable provider rather than returning an empty chain (CTO MEDIUM).
  const finalChain = resolved.length === 0 && enabled.length > 0 ? usableChain() : resolved

  // Per-feature override (ORR-674): if this feature pins a provider and that
  // provider is present + usable in the chain, move it to the front. Fallback
  // order (and cap degrade-to-ollama in the router) is otherwise untouched — an
  // override reorders, it never removes the resilience of the rest of the chain.
  if (feature) {
    const overrides = await featureOverrides(supabase)
    const pinned = overrides.get(feature)
    if (pinned) {
      const idx = finalChain.findIndex((r) => r.provider === pinned)
      if (idx > 0) {
        const [picked] = finalChain.splice(idx, 1)
        finalChain.unshift(picked)
      }
    }
  }
  return finalChain
}

// ── Admin UI (masked) ─────────────────────────────────────────────────────────

export interface AiProviderSafe {
  provider: AiProviderName
  label: string
  enabled: boolean
  baseUrl: string | null
  model: string | null
  hasApiKey: boolean
  priority: number
  selfHosted: boolean
  configured: boolean
}
export interface AiProvidersView {
  providers: AiProviderSafe[]
  primaryProvider: AiProviderName | null
  /** ORR-674: current { feature -> provider } overrides for the admin form. */
  featureProviderOverrides: FeatureProviderOverrides
}

export async function getAiProviders(ctx: AiProviderCallContext): Promise<AiProvidersView> {
  void ctx
  const supabase = (await createServerClient()) as unknown as Db
  const { data: rows, error } = await supabase.from("ai_providers").select("*")
  if (error) throw new Error(`Failed to load AI providers: ${error.message}`)
  const byName = new Map<string, Row>((rows ?? []).map((r) => [r.provider, r]))

  const providers: AiProviderSafe[] = AI_PROVIDER_NAMES.map((p) => {
    const row = byName.get(p)
    const e = envFor(p)
    const selfHosted = SELF_HOSTED_PROVIDERS.includes(p)
    const baseUrl = firstNonEmpty(row?.base_url, e.baseUrl)
    const apiKeySet = !!row?.api_key || !!e.apiKey
    return {
      provider: p,
      // eslint-disable-next-line security/detect-object-injection -- p iterates the constrained AI_PROVIDER_NAMES union, not user input
      label: PROVIDER_LABELS[p],
      enabled: row?.enabled ?? false,
      baseUrl: row?.base_url ?? null,
      model: row?.model ?? null,
      hasApiKey: !!row?.api_key,
      priority: row?.priority ?? 100,
      selfHosted,
      configured: isUsable(p, baseUrl, apiKeySet ? "set" : null),
    }
  })
  const [primary, overrides] = await Promise.all([primaryProvider(supabase), featureOverrides(supabase)])
  return {
    providers,
    primaryProvider: primary,
    featureProviderOverrides: Object.fromEntries(overrides) as FeatureProviderOverrides,
  }
}

const providerEnum = z.enum(AI_PROVIDER_NAMES as [AiProviderName, ...AiProviderName[]])
// Derived from the single source of truth (AI_FEATURE_NAMES) so it can never
// drift from the feature vocabulary the form fans an override out to — a
// hardcoded subset silently rejected the whole "Save providers" submit once
// account_extraction/contact_extraction were added (ORR-807a).
const featureEnum = z.enum(AI_FEATURE_NAMES as [AiFeature, ...AiFeature[]])

export const aiProvidersUpdateSchema = z.object({
  providers: z.array(
    z.object({
      provider: providerEnum,
      enabled: z.boolean().optional(),
      baseUrl: z.string().max(500).nullable().optional().or(z.literal("")),
      model: z.string().max(200).nullable().optional().or(z.literal("")),
      apiKey: z.string().max(1000).optional(), // write-only; blank = keep
      priority: z.number().int().min(0).max(1000).optional(),
    }),
  ),
  primaryProvider: providerEnum.nullable().optional(),
  // ORR-674: full replace of the { feature -> provider } override map. Omit to
  // leave overrides untouched; send {} to clear all.
  featureProviderOverrides: z.record(featureEnum, providerEnum).optional(),
})
export type AiProvidersUpdateInput = z.input<typeof aiProvidersUpdateSchema>

export async function updateAiProviders(
  ctx: AiProviderCallContext,
  input: AiProvidersUpdateInput,
): Promise<void> {
  const parsed = aiProvidersUpdateSchema.parse(input)
  const supabase = (await createServerClient()) as unknown as Db

  for (const p of parsed.providers) {
    const patch: Database["public"]["Tables"]["ai_providers"]["Update"] = { updated_by: ctx.user.id }
    if (p.enabled !== undefined) patch.enabled = p.enabled
    if (p.baseUrl !== undefined) patch.base_url = emptyToNull(p.baseUrl ?? null)
    if (p.model !== undefined) patch.model = emptyToNull(p.model ?? null)
    if (p.priority !== undefined) patch.priority = p.priority
    if (p.apiKey && p.apiKey.length > 0) patch.api_key = p.apiKey
    const { error } = await supabase.from("ai_providers").update(patch).eq("provider", p.provider)
    if (error) throw new Error(`Failed to update provider ${p.provider}: ${error.message}`)
  }

  // Provider SELECTION (primary + per-feature overrides) both live on the
  // singleton ai_settings row — write whichever the caller sent in one upsert.
  const settingsPatch: Database["public"]["Tables"]["ai_settings"]["Update"] = {}
  if (parsed.primaryProvider !== undefined) settingsPatch.primary_provider = parsed.primaryProvider
  if (parsed.featureProviderOverrides !== undefined) {
    settingsPatch.feature_provider_overrides = parsed.featureProviderOverrides
  }

  if (Object.keys(settingsPatch).length > 0) {
    const { data: existing } = await supabase
      .from("ai_settings").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle()
    if (existing) {
      const { error } = await supabase.from("ai_settings").update(settingsPatch).eq("id", existing.id)
      if (error) throw new Error(`Failed to update AI provider selection: ${error.message}`)
    } else {
      const { error } = await supabase.from("ai_settings").insert({ ...settingsPatch, created_by: ctx.user.id })
      if (error) throw new Error(`Failed to update AI provider selection: ${error.message}`)
    }
  }
}
