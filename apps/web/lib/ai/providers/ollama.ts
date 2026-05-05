import type { ProviderAdapter } from "../types"

export function createOllamaAdapter(model = "llama3.2"): ProviderAdapter {
  const baseUrl = process.env.OLLAMA_BASE_URL

  return {
    async call(prompt: string, _systemPrompt?: string) {
      if (!baseUrl) {
        throw new Error("OLLAMA_BASE_URL is not configured")
      }

      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
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
    },
  }
}
