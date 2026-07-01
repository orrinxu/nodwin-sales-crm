import type { ProviderAdapter } from "../types"
import { createAnthropicAdapter } from "./anthropic"
import { createGeminiAdapter } from "./gemini"
import { createDeepseekAdapter } from "./deepseek"
import { createMoonshotAdapter } from "./moonshot"
import { createOllamaAdapter } from "./ollama"
import { createOpenAICompatibleAdapter } from "./openai-compatible"

export type ProviderName = "claude" | "gemini" | "kimi" | "deepseek" | "ollama_local" | "openai_compatible"

export function createAdaptersFromEnv(): Map<ProviderName, ProviderAdapter> {
  const adapters = new Map<ProviderName, ProviderAdapter>()

  if (process.env.ANTHROPIC_API_KEY) {
    adapters.set("claude", createAnthropicAdapter())
  }

  if (process.env.GOOGLE_API_KEY) {
    adapters.set("gemini", createGeminiAdapter())
  }

  if (process.env.DEEPSEEK_API_KEY) {
    adapters.set("deepseek", createDeepseekAdapter())
  }

  if (process.env.MOONSHOT_API_KEY) {
    adapters.set("kimi", createMoonshotAdapter())
  }

  if (process.env.OLLAMA_BASE_URL) {
    adapters.set("ollama_local", createOllamaAdapter())
  }

  if (process.env.OPENAI_COMPATIBLE_BASE_URL) {
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
