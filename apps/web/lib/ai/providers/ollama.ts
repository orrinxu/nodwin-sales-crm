import type { AdapterConfig, AdapterCallOptions, ProviderAdapter } from "../types"
import { ollamaImages } from "./content"
import { env } from "@/lib/security/env"

export function createOllamaAdapter(config: AdapterConfig = {}): ProviderAdapter {
  const model = config.model ?? env.OLLAMA_MODEL ?? "llama3.2"
  const baseUrl = (config.baseUrl ?? env.OLLAMA_BASE_URL ?? "").replace(/\/+$/, "") || undefined

  return {
    async call(prompt: string, _systemPrompt?: string, options?: AdapterCallOptions) {
      if (!baseUrl) {
        throw new Error("OLLAMA_BASE_URL is not configured")
      }
      const images = ollamaImages(options?.images)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)

      try {
        const response = await fetch(`${baseUrl}/api/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt,
            stream: false,
            ...(images ? { images } : {}),
            ...(options?.json ? { format: "json" } : {}),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const err = await response.text()
          throw new Error(`Ollama API error ${response.status}: ${err}`)
        }

        const data = await response.json()
        const text = data.response ?? ""

        return {
          text,
          model,
          promptTokens: data.prompt_eval_count ?? 0,
          completionTokens: data.eval_count ?? 0,
        }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
