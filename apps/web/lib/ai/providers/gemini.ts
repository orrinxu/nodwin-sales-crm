import type { ProviderAdapter } from "../types"

export function createGeminiAdapter(model = "gemini-1.5-pro"): ProviderAdapter {
  const apiKey = process.env.GOOGLE_API_KEY

  return {
    async call(prompt: string, _systemPrompt?: string) {
      if (!apiKey) {
        throw new Error("GOOGLE_API_KEY is not configured")
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
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
    },
  }
}
