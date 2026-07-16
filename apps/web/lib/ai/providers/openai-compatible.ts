import type { AdapterCallOptions, ProviderAdapter } from "../types"
import { openAiUserContent } from "./content"
import { env } from "@/lib/security/env"

export interface OpenAICompatibleConfig {
  /**
   * Base URL up to and including the API version, e.g.
   *   https://api.openai.com/v1          (OpenAI)
   *   http://192.168.88.233:11434/v1     (Ollama's OpenAI-compatible endpoint)
   *   http://localhost:1234/v1           (LM Studio)
   *   http://localhost:8080/v1           (llama.cpp server)
   * The adapter POSTs to `${baseUrl}/chat/completions`.
   */
  baseUrl: string
  /** Optional — many self-hosted servers don't require a key. */
  apiKey?: string
  model: string
}

/**
 * Generic adapter for any server that speaks the OpenAI Chat Completions API.
 * This is the "drop in a local LLM without a redeploy" gateway: point
 * OPENAI_COMPATIBLE_BASE_URL / _MODEL / _API_KEY at any compatible endpoint.
 */
export function createOpenAICompatibleAdapter(
  config: Partial<OpenAICompatibleConfig> = {},
): ProviderAdapter {
  const baseUrl = (config.baseUrl ?? env.OPENAI_COMPATIBLE_BASE_URL ?? "").replace(/\/+$/, "")
  const apiKey = config.apiKey ?? env.OPENAI_COMPATIBLE_API_KEY
  const model = config.model ?? env.OPENAI_COMPATIBLE_MODEL ?? "gpt-4o-mini"

  return {
    async call(prompt: string, systemPrompt?: string, options?: AdapterCallOptions) {
      if (!baseUrl) {
        throw new Error("OPENAI_COMPATIBLE_BASE_URL is not configured")
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: [
              ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
              { role: "user", content: openAiUserContent(prompt, options?.images) },
            ],
            ...(options?.json ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const err = await response.text()
          throw new Error(`OpenAI-compatible API error ${response.status}: ${err}`)
        }

        const data = await response.json()
        const text = data.choices?.[0]?.message?.content ?? ""

        return {
          text,
          model: data.model ?? model,
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
        }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
