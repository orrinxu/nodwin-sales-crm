import type { ProviderAdapter } from "../types"

const MODEL_REGEX = /^[a-zA-Z0-9_.-]+$/

export function createGeminiAdapter(
  model = process.env.GEMINI_MODEL ?? "gemini-1.5-pro",
): ProviderAdapter {
  const apiKey = process.env.GOOGLE_API_KEY

  return {
    async call(prompt: string, _systemPrompt?: string) {
      if (!apiKey) {
        throw new Error("GOOGLE_API_KEY is not configured")
      }

      if (!MODEL_REGEX.test(model)) {
        throw new Error(`Invalid Gemini model name: ${model}`)
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const err = await response.text()
          throw new Error(`Gemini API error ${response.status}: ${err}`)
        }

        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

        return {
          text,
          model,
          promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}
