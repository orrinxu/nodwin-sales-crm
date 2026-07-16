import type { AdapterConfig, ProviderAdapter } from "../types"
import { createAnthropicAdapter } from "./anthropic"
import { createGeminiAdapter } from "./gemini"
import { createDeepseekAdapter } from "./deepseek"
import { createMoonshotAdapter } from "./moonshot"
import { createOllamaAdapter } from "./ollama"
import { createOpenAICompatibleAdapter } from "./openai-compatible"
import { env } from "@/lib/security/env"

export type ProviderName = "claude" | "gemini" | "kimi" | "deepseek" | "ollama_local" | "openai_compatible"

const FACTORIES: Record<ProviderName, (config: AdapterConfig) => ProviderAdapter> = {
  claude: createAnthropicAdapter,
  gemini: createGeminiAdapter,
  deepseek: createDeepseekAdapter,
  kimi: createMoonshotAdapter,
  ollama_local: createOllamaAdapter,
  openai_compatible: createOpenAICompatibleAdapter,
}

/** One entry of a resolved (ordered) provider chain — see lib/data/ai-providers. */
export interface ResolvedAdapterEntry {
  provider: ProviderName
  baseUrl: string | null
  model: string | null
  apiKey: string | null
}

/**
 * Build the adapters map from a resolved provider chain. Map insertion order IS
 * the router's call order (primary first, then priority) — the router honors it.
 * This is the DB-driven path (ORR-635): config comes from ai_providers, not env.
 */
export function createAdaptersFromChain(chain: ResolvedAdapterEntry[]): Map<ProviderName, ProviderAdapter> {
  const adapters = new Map<ProviderName, ProviderAdapter>()
  for (const entry of chain) {
    const factory = FACTORIES[entry.provider]
    if (!factory) continue
    adapters.set(
      entry.provider,
      factory({
        model: entry.model ?? undefined,
        apiKey: entry.apiKey ?? undefined,
        baseUrl: entry.baseUrl ?? undefined,
      }),
    )
  }
  return adapters
}

/**
 * Env-only fallback builder (backward compat). Prefer the DB-driven
 * createProviderAdapters() in provider-chain.ts. Kept so the app still routes
 * before an admin configures providers, and for pure unit tests.
 */
export function createAdaptersFromEnv(): Map<ProviderName, ProviderAdapter> {
  const adapters = new Map<ProviderName, ProviderAdapter>()

  if (env.ANTHROPIC_API_KEY) {
    adapters.set("claude", createAnthropicAdapter())
  }

  if (env.GOOGLE_API_KEY) {
    adapters.set("gemini", createGeminiAdapter())
  }

  if (env.DEEPSEEK_API_KEY) {
    adapters.set("deepseek", createDeepseekAdapter())
  }

  if (env.MOONSHOT_API_KEY) {
    adapters.set("kimi", createMoonshotAdapter())
  }

  if (env.OLLAMA_BASE_URL) {
    adapters.set("ollama_local", createOllamaAdapter())
  }

  if (env.OPENAI_COMPATIBLE_BASE_URL) {
    adapters.set("openai_compatible", createOpenAICompatibleAdapter())
  }

  return adapters
}

export {
  createAnthropicAdapter,
  createGeminiAdapter,
  createDeepseekAdapter,
  createMoonshotAdapter,
  createOllamaAdapter,
  createOpenAICompatibleAdapter,
}
