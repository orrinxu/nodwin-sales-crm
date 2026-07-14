import "server-only"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { aiCall } from "./router"
import { createProviderAdapters } from "./provider-chain"
import { Money } from "../money"
import type { AiImageInput, ProviderAdapter } from "./types"
import type { ProviderName } from "./providers"
import {
  SERVICE_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  PROJECT_TYPES,
  REVENUE_CATEGORIES,
  RECURRING_SPLIT_KINDS,
} from "../data/opportunities.types"

// Opportunity Generator — extraction service (ORR-675, ticket 2/4).
//
// Reads free-form document text (an RFP, an email chain, pasted notes) and
// returns a STRICT JSON object of candidate opportunity fields. Each field
// carries { value, confidence, source } so the review UI (ORR-677) can badge it
// and show the evidence; fields with no evidence are OMITTED, never guessed.
//
// This is the pre-fill front-end only: it never writes an opportunity. Resolving
// the raw values to real records / enum values is the resolver's job (ORR-676),
// and the create still goes through the existing createOpportunity path.
//
// It routes through the SAME general AI seam as the copilot (aiCall +
// createProviderAdapters), tagged feature "opportunity_extraction" — so ORR-674's
// per-feature provider selection points it at the chosen model (Claude), and the
// daily cap enforcement + ai_usage logging apply automatically.
//
// The four fields we deliberately NEVER infer — owner, stage, probability,
// visibility_tier — are simply absent from the schema; they get safe defaults
// downstream (current user / Qualify / stage default / Standard).

export const EXTRACTION_FEATURE = "opportunity_extraction" as const

/** Shown when no AI provider is configured (neither admin settings nor env). */
export const EXTRACTION_UNCONFIGURED_MESSAGE =
  "AI is not configured. Configure an AI provider under Admin → AI."

// No per-token pricing table exists in the codebase yet, so we pass a small flat
// estimate — extraction reads a whole document, so budget a bit more than the
// copilot's single-shot assists. The cap enforcer still gates on it and usage is
// logged with a non-zero, attributable cost. A real per-provider price is a follow-up.
export const EXTRACTION_ESTIMATED_COST = Money.fromAmount("0.03", "USD")
const EXTRACTION_COMPLETION_TOKEN_BUDGET = 1500
/** Bound the document we send (cost + latency). ~24k chars ≈ 6k tokens. */
export const MAX_EXTRACTION_INPUT_CHARS = 24000

/** Rough token estimate (~4 chars/token) for logging/cap inputs only. */
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4)
}

// ── Extraction field schema ─────────────────────────────────────────────────

const confidence = z.coerce.number().min(0).max(1).catch(0.5)

/** One extracted field: the value plus the model's confidence and a source snippet. */
function field<T extends z.ZodTypeAny>(value: T) {
  return z.object({
    value,
    confidence,
    source: z.string().max(2000).optional().default(""),
  })
}

/** Money-ish values may come back as a number or a string — normalise to a string. */
const amountLike = z.union([z.string(), z.number()]).transform((v) => String(v).trim())

/**
 * The candidate-fields schema, mirroring opportunityCreateSchema MINUS the
 * never-infer four. FK/enum fields hold the raw extracted text (a company name,
 * a service-type label) — the resolver (ORR-676) maps them to ids / enum values.
 * Every field is optional: the model omits anything it has no evidence for.
 * Unknown keys are stripped (tolerant of extra model output).
 */
export const opportunityExtractionSchema = z.object({
  name: field(z.string().min(1).max(200)).optional(),
  account: field(z.string().min(1).max(200)).optional(),
  primaryContact: field(z.string().min(1).max(200)).optional(),
  salesUnit: field(z.string().min(1).max(200)).optional(),
  amount: field(amountLike).optional(),
  currency: field(z.string().min(1).max(20)).optional(),
  closeDate: field(z.string().max(40)).optional(),
  servicePeriodStart: field(z.string().max(40)).optional(),
  servicePeriodEnd: field(z.string().max(40)).optional(),
  executionDate: field(z.string().max(40)).optional(),
  countryExecution: field(z.string().max(200)).optional(),
  serviceType: field(z.array(z.string().max(120)).min(1).max(20)).optional(),
  propertyType: field(z.string().max(120)).optional(),
  projectType: field(z.string().max(80)).optional(),
  revenueCategory: field(z.string().max(40)).optional(),
  recurring: field(z.boolean()).optional(),
  recurringSplitKind: field(z.string().max(40)).optional(),
  barterValue: field(amountLike).optional(),
  estimatedGrossMarginPct: field(z.coerce.number()).optional(),
  description: field(z.string().max(2000)).optional(),
})

export type ExtractedOpportunityFields = z.infer<typeof opportunityExtractionSchema>
export type ExtractedFieldKey = keyof ExtractedOpportunityFields

/**
 * Human descriptions used to build the prompt's field guide. Keyed to the schema
 * via `Record<ExtractedFieldKey, string>` — adding or removing a schema field
 * without updating this map is a compile error, so the two never drift.
 */
const FIELD_GUIDE: Record<ExtractedFieldKey, string> = {
  name: "Opportunity/deal name or a short descriptive title.",
  account: "Client company or brand the deal is with (company name exactly as written).",
  primaryContact: "Primary contact person — their name, plus their email in parentheses if present.",
  salesUnit: "The NODWIN business unit / team named as handling the deal, if any is mentioned.",
  amount: "Deal value as digits only — no currency symbol, no thousands separators (e.g. 50000).",
  currency:
    "Currency of the amount — an ISO 4217 code if identifiable (USD, INR, EUR), otherwise the symbol or word as written.",
  closeDate:
    "Expected close/decision date as ISO YYYY-MM-DD. Only if a date is clearly stated AND the day/month order is unambiguous; if ambiguous, OMIT it.",
  servicePeriodStart: "Service/event start date as ISO YYYY-MM-DD (same ambiguity rule).",
  servicePeriodEnd: "Service/event end date as ISO YYYY-MM-DD (same ambiguity rule).",
  executionDate: "Execution/delivery date as ISO YYYY-MM-DD (same ambiguity rule).",
  countryExecution: "Country or countries where the work/event takes place.",
  serviceType: `Service type(s) as an array. Map to only these labels: ${Object.values(SERVICE_TYPE_LABELS).join("; ")}.`,
  propertyType: `Property/event type. Map to only one of: ${Object.values(PROPERTY_TYPE_LABELS).join("; ")}.`,
  projectType: `Project type. Map to only one of: ${PROJECT_TYPES.join(", ")}.`,
  revenueCategory: `Revenue category — one of: ${REVENUE_CATEGORIES.join(", ")}.`,
  recurring: "true if this is a recurring or multi-year deal, otherwise false.",
  recurringSplitKind: `Only if recurring is true — one of: ${RECURRING_SPLIT_KINDS.join(", ")}.`,
  barterValue: "Barter / in-kind value as digits only, if mentioned.",
  estimatedGrossMarginPct: "Estimated gross margin as a percentage number (just the number), if stated.",
  description: "A neutral one-to-two sentence summary of the deal, drawn only from the document.",
}

export const EXTRACTION_SYSTEM_PROMPT = [
  "You extract structured sales-opportunity fields from a source document (an RFP, an email chain, chat notes, in any language).",
  "",
  "Output rules — follow them exactly:",
  "1. Reply with ONLY a single JSON object. No prose, no explanation, no markdown, no code fences.",
  "2. Each field's value comes ONLY from the document. Never use outside knowledge and never invent a value.",
  "3. If the document gives no evidence for a field, OMIT that field entirely. Do not include it with a null/empty/guessed value.",
  "4. Each included field MUST be an object of exactly this shape: {\"value\": <the value>, \"confidence\": <0..1>, \"source\": \"<short verbatim snippet the value came from>\"}.",
  "5. `confidence` is your 0-to-1 certainty. `source` is a short quote (a few words) copied verbatim from the document — keep the original language.",
  "6. Do NOT output owner, stage, probability, or visibility — those are set by the user, not extracted.",
  "7. For dates, only emit a value when the day/month order is unambiguous; otherwise omit the date.",
].join("\n")

const EXTRACTION_SHAPE_EXAMPLE =
  '{"name":{"value":"Valorant India Invitational","confidence":0.9,"source":"subject: Valorant India Invitational"},"amount":{"value":"5000000","confidence":0.8,"source":"budget of INR 50,00,000"},"currency":{"value":"INR","confidence":0.8,"source":"INR 50,00,000"}}'

function fieldGuideBlock(): string {
  return Object.entries(FIELD_GUIDE)
    .map(([key, desc]) => `- ${key}: ${desc}`)
    .join("\n")
}

/** The user message: the field guide, a shape example, then the document. */
export function buildExtractionPrompt(documentText: string, truncated: boolean): string {
  return [
    "Extract these fields (include a field ONLY if the document supports it):",
    fieldGuideBlock(),
    "",
    "Shape example (yours will have whichever fields the document supports):",
    EXTRACTION_SHAPE_EXAMPLE,
    "",
    truncated ? "NOTE: the document was truncated; extract from what is present." : "",
    "DOCUMENT (the only source of truth):",
    "```",
    documentText,
    "```",
  ]
    .filter(Boolean)
    .join("\n")
}

/** The user message when the source is an attached image (ORR-686 vision). */
export function buildImageExtractionPrompt(): string {
  return [
    "Extract these fields from the ATTACHED IMAGE (include a field ONLY if the image supports it):",
    fieldGuideBlock(),
    "",
    "Shape example (yours will have whichever fields the image supports):",
    EXTRACTION_SHAPE_EXAMPLE,
    "",
    "The image (a screenshot of a chat, email, or document) is the only source of truth. Read all visible text.",
  ].join("\n")
}

// ── Parsing ─────────────────────────────────────────────────────────────────

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

// ── Service ─────────────────────────────────────────────────────────────────

export interface OpportunityExtractionResult {
  ok: boolean
  fields?: ExtractedOpportunityFields
  model?: string | null
  /** True when no AI provider is configured — the caller renders a hint, not an error. */
  unconfigured?: boolean
  /** True when the document exceeded MAX_EXTRACTION_INPUT_CHARS and was clipped. */
  truncated?: boolean
  error?: string
}

/** Injected for testing; production uses the DB-driven chain + the real aiCall. */
export interface OpportunityExtractionDeps {
  resolveAdapters?: () => Promise<Map<ProviderName, ProviderAdapter>>
  aiCall?: typeof aiCall
}

function failureMessage(reason: string | undefined): string {
  if (reason === "service_unavailable") {
    return "Your daily AI budget has been reached. Try again later or ask an admin to raise the cap."
  }
  return "The AI provider could not be reached. Please try again."
}

/**
 * Extract candidate opportunity fields from document text. Routes through the
 * shared aiCall seam (per-feature provider, caps, usage logging). Retries once if
 * the model's first reply is not parseable JSON. Never throws for the normal
 * failure modes — returns an `ok: false` result the UI can render.
 */
export async function extractOpportunityFromText(
  input: { text?: string; images?: AiImageInput[]; userId: string; requestId?: string },
  deps: OpportunityExtractionDeps = {},
): Promise<OpportunityExtractionResult> {
  const resolveAdapters = deps.resolveAdapters ?? (() => createProviderAdapters(EXTRACTION_FEATURE))
  const call = deps.aiCall ?? aiCall

  const text = (input.text ?? "").trim()
  const images = input.images ?? []
  if (!text && images.length === 0) {
    return { ok: false, error: "No document text or image was provided." }
  }

  const adapters = await resolveAdapters()
  if (adapters.size === 0) {
    return { ok: false, unconfigured: true, error: EXTRACTION_UNCONFIGURED_MESSAGE }
  }

  const truncated = text.length > MAX_EXTRACTION_INPUT_CHARS
  const doc = truncated ? text.slice(0, MAX_EXTRACTION_INPUT_CHARS) : text
  // Image-only source (ORR-686) → the vision prompt; otherwise the document prompt.
  const basePrompt = text ? buildExtractionPrompt(doc, truncated) : buildImageExtractionPrompt()
  const requestId = input.requestId ?? `oppgen-extract-${randomUUID()}`

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nYour previous reply could not be parsed. Reply with ONLY the JSON object — no prose, no code fences.`

    const result = await call(
      {
        feature: EXTRACTION_FEATURE,
        userId: input.userId,
        prompt,
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        // ORR-686: attach any images and request native JSON where supported.
        images: images.length > 0 ? images : undefined,
        json: true,
        estimatedCost: EXTRACTION_ESTIMATED_COST,
        estimatePromptTokens: estimateTokens(EXTRACTION_SYSTEM_PROMPT) + estimateTokens(prompt),
        estimateCompletionTokens: EXTRACTION_COMPLETION_TOKEN_BUDGET,
        requestId,
      },
      { adapters },
    )

    if (!result.ok) return { ok: false, error: failureMessage(result.reason) }

    const validated = opportunityExtractionSchema.safeParse(extractJsonObject(result.data ?? ""))
    if (validated.success) {
      return { ok: true, fields: validated.data, model: result.model ?? null, truncated }
    }
    // else: fall through and retry once with a corrective nudge
  }

  return {
    ok: false,
    error:
      "The document could not be read into structured fields. Try a clearer document, or fill the form in manually.",
  }
}
