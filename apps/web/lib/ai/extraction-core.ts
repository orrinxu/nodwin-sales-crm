import "server-only"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { aiCall } from "./router"
import { createProviderAdapters } from "./provider-chain"
import { Money } from "../money"
import type { AiFeature, AiImageInput, ProviderAdapter } from "./types"
import type { ProviderName } from "./providers"

// Generic extraction core (ORR-733, Track A of ORR-732). Factors out the reusable
// machinery from the opportunity extractor (ORR-675) so account/contact extractors
// share one battle-tested loop: field wrapper, JSON extraction, the aiCall + cap +
// usage-logging seam, JSON mode, image support, and the 2-attempt parse retry.
// Per-type modules provide only the schema, prompts, and feature tag.
//
// (The shipped opportunity extractor still has its own copy; consolidating it onto
// this core is a low-risk follow-up, not this ticket.)

export const EXTRACTION_UNCONFIGURED_MESSAGE =
  "AI is not configured. Configure an AI provider under Admin → AI."
export const EXTRACTION_ESTIMATED_COST = Money.fromAmount("0.03", "USD")
export const EXTRACTION_COMPLETION_TOKEN_BUDGET = 1500
/** Bound the document we send (cost + latency). ~24k chars ≈ 6k tokens. */
export const MAX_EXTRACTION_INPUT_CHARS = 24000

/** Rough token estimate (~4 chars/token) for logging/cap inputs only. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4)
}

const confidenceSchema = z.coerce.number().min(0).max(1).catch(0.5)

/** One extracted field: the value plus the model's confidence and a source snippet. */
export function field<T extends z.ZodTypeAny>(value: T) {
  return z.object({
    value,
    confidence: confidenceSchema,
    source: z.string().max(2000).optional().default(""),
  })
}

/** Money-ish values may come back as a number or a string — normalise to a string. */
export const amountLike = z.union([z.string(), z.number()]).transform((v) => String(v).trim())

/** Pull a JSON object out of a model reply: direct, then de-fenced, then the
 *  outermost {...} span. Returns undefined if none parses. */
export function extractJsonObject(raw: string): unknown {
  const text = raw.trim()
  const attempts: string[] = [text]
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) attempts.push(fence[1].trim())
  const first = text.indexOf("{")
  const last = text.lastIndexOf("}")
  if (first !== -1 && last > first) attempts.push(text.slice(first, last + 1))
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate)
    } catch {
      // try the next extraction strategy
    }
  }
  return undefined
}

export interface ExtractionDeps {
  resolveAdapters?: () => Promise<Map<ProviderName, ProviderAdapter>>
  aiCall?: typeof aiCall
}

export interface ExtractionResult<T> {
  ok: boolean
  fields?: T
  model?: string | null
  /** True when no AI provider is configured — the caller renders a hint, not an error. */
  unconfigured?: boolean
  /** True when the text exceeded MAX_EXTRACTION_INPUT_CHARS and was clipped. */
  truncated?: boolean
  error?: string
}

function failureMessage(reason: string | undefined): string {
  if (reason === "service_unavailable") {
    return "Your daily AI budget has been reached. Try again later or ask an admin to raise the cap."
  }
  return "The AI provider could not be reached. Please try again."
}

export interface RunExtractionParams<S extends z.ZodTypeAny> {
  feature: AiFeature
  systemPrompt: string
  /** Build the user prompt for a text source. */
  buildTextPrompt: (doc: string, truncated: boolean) => string
  /** Build the user prompt for an image-only source (vision). */
  buildImagePrompt: () => string
  schema: S
  input: { text?: string; images?: AiImageInput[]; userId: string; requestId?: string }
  /** requestId prefix, e.g. "acctgen-extract". */
  requestPrefix: string
  /** Error shown when even the retry fails to parse into the schema. */
  parseFailureMessage: string
}

/**
 * Text/image → validated fields extraction with a 2-attempt parse retry. Routes
 * through the shared aiCall seam (per-feature provider, caps, usage logging).
 * Never throws for the normal failure modes — returns an `ok: false` result.
 */
export async function runExtraction<S extends z.ZodTypeAny>(
  params: RunExtractionParams<S>,
  deps: ExtractionDeps = {},
): Promise<ExtractionResult<z.infer<S>>> {
  const resolveAdapters = deps.resolveAdapters ?? (() => createProviderAdapters(params.feature))
  const call = deps.aiCall ?? aiCall

  const text = (params.input.text ?? "").trim()
  const images = params.input.images ?? []
  if (!text && images.length === 0) {
    return { ok: false, error: "No text or image was provided." }
  }

  const adapters = await resolveAdapters()
  if (adapters.size === 0) {
    return { ok: false, unconfigured: true, error: EXTRACTION_UNCONFIGURED_MESSAGE }
  }

  const truncated = text.length > MAX_EXTRACTION_INPUT_CHARS
  const doc = truncated ? text.slice(0, MAX_EXTRACTION_INPUT_CHARS) : text
  const basePrompt = text ? params.buildTextPrompt(doc, truncated) : params.buildImagePrompt()
  const requestId = params.input.requestId ?? `${params.requestPrefix}-${randomUUID()}`

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nYour previous reply could not be parsed. Reply with ONLY the JSON object — no prose, no code fences.`

    const result = await call(
      {
        feature: params.feature,
        userId: params.input.userId,
        prompt,
        systemPrompt: params.systemPrompt,
        images: images.length > 0 ? images : undefined,
        json: true,
        estimatedCost: EXTRACTION_ESTIMATED_COST,
        estimatePromptTokens: estimateTokens(params.systemPrompt) + estimateTokens(prompt),
        estimateCompletionTokens: EXTRACTION_COMPLETION_TOKEN_BUDGET,
        requestId,
      },
      { adapters },
    )

    if (!result.ok) return { ok: false, error: failureMessage(result.reason) }

    const validated = params.schema.safeParse(extractJsonObject(result.data ?? ""))
    if (validated.success) {
      return { ok: true, fields: validated.data, model: result.model ?? null, truncated }
    }
    // else: fall through and retry once with a corrective nudge
  }

  return { ok: false, error: params.parseFailureMessage }
}
