import type { ProviderAdapter } from "../types"

export function createAnthropicAdapter(model = "claude-3-5-sonnet-20241022"): ProviderAdapter {
  const apiKey = process.env.ANTHROPIC_API_KEY

  return {
    async call(prompt: string, systemPrompt?: string) {
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not configured")
      }

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
          messages: [{ role: "user", content: prompt }],
          ...(systemPrompt ? { system: systemPrompt } : {}),
        }),
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
    },
  }
}
