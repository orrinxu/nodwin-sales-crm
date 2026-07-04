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

/**
 * Default embedder: an OpenAI-compatible `/embeddings` client. Throws a clear
 * "not configured" error until EMBEDDINGS_BASE_URL is wired — the seam is
 * present, nothing is plugged in yet.
 */
export function createEmbedder(): Embedder {
  return {
    async embed(texts: string[]): Promise<EmbeddingResult> {
      const baseUrl = env.EMBEDDINGS_BASE_URL?.replace(/\/+$/, "")
      const model = env.EMBEDDINGS_MODEL
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
          ...(env.EMBEDDINGS_API_KEY ? { Authorization: `Bearer ${env.EMBEDDINGS_API_KEY}` } : {}),
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
