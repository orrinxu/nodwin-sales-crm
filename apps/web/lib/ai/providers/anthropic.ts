import type { AdapterConfig, AdapterCallOptions, ProviderAdapter } from "../types"
import { anthropicUserContent } from "./content"
import { env } from "@/lib/security/env"

export function createAnthropicAdapter(config: AdapterConfig = {}): ProviderAdapter {
  const model = config.model ?? env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"
  const apiKey = config.apiKey ?? env.ANTHROPIC_API_KEY

  return {
    async call(prompt: string, systemPrompt?: string, options?: AdapterCallOptions) {
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not configured")
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            // Anthropic has no response_format/JSON mode; `options.json` is
            // honoured via the caller's prompt instruction. Vision → content blocks.
            messages: [{ role: "user", content: anthropicUserContent(prompt, options?.images) }],
            ...(systemPrompt ? { system: systemPrompt } : {}),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const err = await response.text()
          throw new Error(`Anthropic API error ${response.status}: ${err}`)
        }

        const data = await response.json()
        const text = data.content?.[0]?.text ?? ""

        return {
          text,
          model,
          promptTokens: data.usage?.input_tokens ?? 0,
          completionTokens: data.usage?.output_tokens ?? 0,
        }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
