import "server-only"
import { z } from "zod"
import { field, runExtraction, type ExtractionDeps, type ExtractionResult } from "./extraction-core"
import type { AiImageInput } from "./types"

// Account extraction service (ORR-733, Track A of ORR-732). Reads a free-form note
// (typed, pasted, or — later — a voice transcript) and returns candidate ACCOUNT
// fields, each { value, confidence, source }. Never writes; the resolver + the
// existing createAccount path handle the rest. Mirrors the opportunity extractor
// on the shared extraction-core. Owner is deliberately never inferred (gate G5).

export const ACCOUNT_EXTRACTION_FEATURE = "account_extraction" as const

/** Candidate account fields — mirrors accountCreateSchema minus owner (never inferred). */
export const accountExtractionSchema = z.object({
  name: field(z.string().min(1).max(200)).optional(),
  legalName: field(z.string().min(1).max(200)).optional(),
  website: field(z.string().max(300)).optional(),
  country: field(z.string().max(120)).optional(),
  industry: field(z.string().max(120)).optional(),
  description: field(z.string().max(2000)).optional(),
})

export type ExtractedAccountFields = z.infer<typeof accountExtractionSchema>
type AccountFieldKey = keyof ExtractedAccountFields

const FIELD_GUIDE: Record<AccountFieldKey, string> = {
  name: "The company / brand / account name, exactly as written.",
  legalName: "The full legal entity name if stated (e.g. \"Acme Media Pvt Ltd\"), otherwise omit.",
  website: "The company website or domain if mentioned (e.g. acme.com).",
  country: "The account's primary country if stated.",
  industry: "The account's industry / sector if stated (a short label).",
  description: "A neutral one-to-two sentence description of the account, drawn only from the note.",
}

const ACCOUNT_SYSTEM_PROMPT = [
  "You extract structured CRM account (company) fields from a free-form note (typed, pasted, or a voice transcript, in any language).",
  "",
  "Output rules — follow them exactly:",
  "1. Reply with ONLY a single JSON object. No prose, no explanation, no markdown, no code fences.",
  "2. Each field's value comes ONLY from the note. Never use outside knowledge and never invent a value.",
  "3. If the note gives no evidence for a field, OMIT that field entirely. Do not include it with a null/empty/guessed value.",
  '4. Each included field MUST be exactly this shape: {"value": <the value>, "confidence": <0..1>, "source": "<short verbatim snippet the value came from>"}.',
  "5. `confidence` is your 0-to-1 certainty. `source` is a short verbatim quote from the note, in its original language.",
  "6. Do NOT output an owner — that is assigned by the user, not extracted.",
].join("\n")

const ACCOUNT_SHAPE_EXAMPLE =
  '{"name":{"value":"Acme Media","confidence":0.9,"source":"account: Acme Media"},"website":{"value":"acme.com","confidence":0.8,"source":"acme.com"}}'

function fieldGuideBlock(): string {
  return Object.entries(FIELD_GUIDE).map(([key, desc]) => `- ${key}: ${desc}`).join("\n")
}

export function buildAccountTextPrompt(documentText: string, truncated: boolean): string {
  return [
    "Extract these account fields (include a field ONLY if the note supports it):",
    fieldGuideBlock(),
    "",
    "Shape example (yours will have whichever fields the note supports):",
    ACCOUNT_SHAPE_EXAMPLE,
    "",
    truncated ? "NOTE: the text was truncated; extract from what is present." : "",
    "NOTE (the only source of truth):",
    "```",
    documentText,
    "```",
  ].filter(Boolean).join("\n")
}

export function buildAccountImagePrompt(): string {
  return [
    "Extract these account fields from the ATTACHED IMAGE (include a field ONLY if the image supports it):",
    fieldGuideBlock(),
    "",
    "Shape example (yours will have whichever fields the image supports):",
    ACCOUNT_SHAPE_EXAMPLE,
    "",
    "The image (a screenshot of a chat, email, or document) is the only source of truth. Read all visible text.",
  ].join("\n")
}

export async function extractAccountFromText(
  input: { text?: string; images?: AiImageInput[]; userId: string; requestId?: string },
  deps: ExtractionDeps = {},
): Promise<ExtractionResult<ExtractedAccountFields>> {
  return runExtraction(
    {
      feature: ACCOUNT_EXTRACTION_FEATURE,
      systemPrompt: ACCOUNT_SYSTEM_PROMPT,
      buildTextPrompt: buildAccountTextPrompt,
      buildImagePrompt: buildAccountImagePrompt,
      schema: accountExtractionSchema,
      input,
      requestPrefix: "acctgen-extract",
      parseFailureMessage:
        "The note could not be read into structured account fields. Try clearer wording, or fill the form in manually.",
    },
    deps,
  )
}
