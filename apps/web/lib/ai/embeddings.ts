import "server-only"
import { env } from "../security/env"

// ORR-620: embedding seam. The model is intentionally OPEN — point
// EMBEDDINGS_BASE_URL at any OpenAI-compatible server (llama.cpp launched with
// --embedding, LM Studio, etc.). We POST to `${baseUrl}/embeddings` and read the
// vector width off the response, so no dimension is hard-coded anywhere.

export interface EmbeddingResult {
  /** One vector per input string, in order. */
  vectors: number[][]
  /** The model that produced the vectors (stored as chunk provenance). */
  model: string
  /** Vector width, derived from the response (stored as chunk provenance). */
  dim: number
}

/** Injectable interface so the worker and tests can swap the real client out. */
export interface Embedder {
  embed(texts: string[]): Promise<EmbeddingResult>
}

interface OpenAIEmbeddingResponse {
  data: { embedding: number[]; index: number }[]
  model?: string
}

/** Resolved endpoint config (from ai_settings DB-then-env). */
export interface EmbedderConfig {
  baseUrl: string | null
  model: string | null
  apiKey: string | null
}

/**
 * Default embedder: an OpenAI-compatible `/embeddings` client. Pass a resolved
 * config (ORR-634 ai_settings, DB-then-env); with no arg it falls back to the
 * EMBEDDINGS_* env vars directly (legacy / tests). Throws a clear "not
 * configured" error until an endpoint + model are set.
 */
export function createEmbedder(config?: EmbedderConfig): Embedder {
  const src: EmbedderConfig = config ?? {
    baseUrl: env.EMBEDDINGS_BASE_URL ?? null,
    model: env.EMBEDDINGS_MODEL ?? null,
    apiKey: env.EMBEDDINGS_API_KEY ?? null,
  }
  return {
    async embed(texts: string[]): Promise<EmbeddingResult> {
      const baseUrl = src.baseUrl?.replace(/\/+$/, "")
      const model = src.model
      if (!baseUrl || !model) {
        throw new Error(
          "Embeddings are not configured — set EMBEDDINGS_BASE_URL and EMBEDDINGS_MODEL " +
            "to an OpenAI-compatible endpoint (e.g. a llama.cpp --embedding server).",
        )
      }
      if (texts.length === 0) return { vectors: [], model, dim: 0 }

      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(src.apiKey ? { Authorization: `Bearer ${src.apiKey}` } : {}),
        },
        body: JSON.stringify({ model, input: texts }),
      })

      if (!response.ok) {
        const err = await response.text().catch(() => "")
        throw new Error(`Embeddings API error ${response.status}: ${err}`)
      }

      const json = (await response.json()) as OpenAIEmbeddingResponse
      // Preserve input order regardless of how the server returns them.
      const vectors = json.data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding)

      if (vectors.length !== texts.length) {
        throw new Error(
          `Embeddings API returned ${vectors.length} vectors for ${texts.length} inputs`,
        )
      }
      const dim = vectors[0]?.length ?? 0
      if (dim === 0) {
        throw new Error("Embeddings API returned empty vectors")
      }
      return { vectors, model: json.model ?? model, dim }
    },
  }
}
