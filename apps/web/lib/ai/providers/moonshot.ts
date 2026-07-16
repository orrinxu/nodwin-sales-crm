import type { AdapterConfig, AdapterCallOptions, ProviderAdapter } from "../types"
import { openAiUserContent } from "./content"
import { env } from "@/lib/security/env"

export function createMoonshotAdapter(config: AdapterConfig = {}): ProviderAdapter {
  const model = config.model ?? env.MOONSHOT_MODEL ?? "moonshot-v1-8k"
  const apiKey = config.apiKey ?? env.MOONSHOT_API_KEY

  return {
    async call(prompt: string, systemPrompt?: string, options?: AdapterCallOptions) {
      if (!apiKey) {
        throw new Error("MOONSHOT_API_KEY is not configured")
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)

      try {
        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
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
          throw new Error(`Moonshot API error ${response.status}: ${err}`)
        }

        const data = await response.json()
        const text = data.choices?.[0]?.message?.content ?? ""

        return {
          text,
          model,
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
        }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
