import type { AiProviderName } from "@/lib/data/ai-providers"

/**
 * Curated, hand-maintained list of known model ids per provider. These are
 * surfaced as selectable suggestions in the admin AI providers form so admins
 * don't have to memorise exact model strings.
 *
 * This is only a convenience list — the model field remains a free-text string
 * and any custom / newer id can always be typed and saved. Update this list
 * when a provider ships a new model.
 *
 * Each provider's first entry mirrors that provider's adapter default in
 * lib/ai/providers/<provider>.ts, so the picker stays consistent with the code
 * that actually calls the model:
 *   - claude    → claude-sonnet-4-6   (lib/ai/providers/anthropic.ts)
 *   - gemini    → gemini-1.5-pro      (lib/ai/providers/gemini.ts)
 *   - kimi      → moonshot-v1-8k      (lib/ai/providers/moonshot.ts)
 *   - deepseek  → deepseek-chat       (lib/ai/providers/deepseek.ts)
 *
 * Self-hosted providers (openai_compatible, ollama_local) intentionally have an
 * empty list — their available models vary per deployment, so the field falls
 * back to a plain free-text input for them.
 */
export const PROVIDER_MODELS: Record<AiProviderName, string[]> = {
  claude: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5"],
  gemini: ["gemini-1.5-pro"],
  kimi: ["moonshot-v1-8k"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  openai_compatible: [],
  ollama_local: [],
}

/** Curated model suggestions for a provider ([] for self-hosted providers). */
export function modelsFor(provider: AiProviderName): string[] {
  // eslint-disable-next-line security/detect-object-injection -- provider is a known AiProviderName union, not user input
  return PROVIDER_MODELS[provider] ?? []
}
