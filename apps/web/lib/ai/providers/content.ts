import type { AiImageInput } from "../types"

// ORR-686 — per-provider request-body shaping for vision input. Each helper is
// pure and returns exactly the provider's expected content shape. When there are
// no images the result is byte-identical to the prior text-only body, so adding
// these is a no-op for existing text calls.

type Block = Record<string, unknown>

/** OpenAI Chat Completions user content: a plain string, or text + image_url blocks. */
export function openAiUserContent(prompt: string, images?: AiImageInput[]): string | Block[] {
  if (!images || images.length === 0) return prompt
  return [
    { type: "text", text: prompt },
    ...images.map((img) => ({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` },
    })),
  ]
}

/** Anthropic Messages user content: a plain string, or image + text blocks (images first). */
export function anthropicUserContent(prompt: string, images?: AiImageInput[]): string | Block[] {
  if (!images || images.length === 0) return prompt
  return [
    ...images.map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.mimeType, data: img.dataBase64 },
    })),
    { type: "text", text: prompt },
  ]
}

/** Gemini `parts`: a text part, plus one inlineData part per image. */
export function geminiParts(prompt: string, images?: AiImageInput[]): Block[] {
  return [
    { text: prompt },
    ...(images ?? []).map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.dataBase64 },
    })),
  ]
}

/** Ollama `/api/generate` images: bare base64 strings (no mime, no data: prefix). */
export function ollamaImages(images?: AiImageInput[]): string[] | undefined {
  if (!images || images.length === 0) return undefined
  return images.map((img) => img.dataBase64)
}
