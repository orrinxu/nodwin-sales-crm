import "server-only"
import { z } from "zod"
import { field, runExtraction, type ExtractionDeps, type ExtractionResult } from "./extraction-core"
import type { AiImageInput } from "./types"

// Contact extraction service (ORR-734, Track A of ORR-732). Reads a free-form note
// and returns candidate CONTACT fields, each { value, confidence, source }. The
// `account` field is the company the contact belongs to — the resolver resolves it
// to a primary_account_id (account-first). Never writes; owner is never inferred
// (gate G5). Built on the shared extraction-core (ORR-733).

export const CONTACT_EXTRACTION_FEATURE = "contact_extraction" as const

/** Candidate contact fields — mirrors contactCreateSchema minus owner (never inferred).
 *  `account` is the company name for linking, resolved to primary_account_id. */
export const contactExtractionSchema = z.object({
  fullName: field(z.string().min(1).max(200)).optional(),
  account: field(z.string().min(1).max(200)).optional(),
  email: field(z.string().max(320)).optional(),
  phone: field(z.string().max(50)).optional(),
  title: field(z.string().max(120)).optional(),
  notes: field(z.string().max(2000)).optional(),
})

export type ExtractedContactFields = z.infer<typeof contactExtractionSchema>
type ContactFieldKey = keyof ExtractedContactFields

const FIELD_GUIDE: Record<ContactFieldKey, string> = {
  fullName: "The contact person's full name, exactly as written.",
  account: "The company / account the contact works for or belongs to, if mentioned.",
  email: "The contact's email address if present.",
  phone: "The contact's phone number if present.",
  title: "The contact's job title / role if stated (a short label).",
  notes: "A neutral one-to-two sentence note about the contact, drawn only from the note.",
}

const CONTACT_SYSTEM_PROMPT = [
  "You extract structured CRM contact (person) fields from a free-form note (typed, pasted, or a voice transcript, in any language).",
  "",
  "Output rules — follow them exactly:",
  "1. Reply with ONLY a single JSON object. No prose, no explanation, no markdown, no code fences.",
  "2. Each field's value comes ONLY from the note. Never use outside knowledge and never invent a value.",
  "3. If the note gives no evidence for a field, OMIT that field entirely. Do not include it with a null/empty/guessed value.",
  '4. Each included field MUST be exactly this shape: {"value": <the value>, "confidence": <0..1>, "source": "<short verbatim snippet the value came from>"}.',
  "5. `confidence` is your 0-to-1 certainty. `source` is a short verbatim quote from the note, in its original language.",
  "6. Do NOT output an owner — that is assigned by the user, not extracted.",
].join("\n")

const CONTACT_SHAPE_EXAMPLE =
  '{"fullName":{"value":"Ada Lovelace","confidence":0.9,"source":"spoke with Ada Lovelace"},"account":{"value":"Acme Media","confidence":0.8,"source":"at Acme Media"},"email":{"value":"ada@acme.com","confidence":0.9,"source":"ada@acme.com"}}'

function fieldGuideBlock(): string {
  return Object.entries(FIELD_GUIDE).map(([key, desc]) => `- ${key}: ${desc}`).join("\n")
}

export function buildContactTextPrompt(documentText: string, truncated: boolean): string {
  return [
    "Extract these contact fields (include a field ONLY if the note supports it):",
    fieldGuideBlock(),
    "",
    "Shape example (yours will have whichever fields the note supports):",
    CONTACT_SHAPE_EXAMPLE,
    "",
    truncated ? "NOTE: the text was truncated; extract from what is present." : "",
    "NOTE (the only source of truth):",
    "```",
    documentText,
    "```",
  ].filter(Boolean).join("\n")
}

export function buildContactImagePrompt(): string {
  return [
    "Extract these contact fields from the ATTACHED IMAGE (include a field ONLY if the image supports it):",
    fieldGuideBlock(),
    "",
    "Shape example (yours will have whichever fields the image supports):",
    CONTACT_SHAPE_EXAMPLE,
    "",
    "The image (a screenshot of a chat, email, business card, or document) is the only source of truth. Read all visible text.",
  ].join("\n")
}

export async function extractContactFromText(
  input: { text?: string; images?: AiImageInput[]; userId: string; requestId?: string },
  deps: ExtractionDeps = {},
): Promise<ExtractionResult<ExtractedContactFields>> {
  return runExtraction(
    {
      feature: CONTACT_EXTRACTION_FEATURE,
      systemPrompt: CONTACT_SYSTEM_PROMPT,
      buildTextPrompt: buildContactTextPrompt,
      buildImagePrompt: buildContactImagePrompt,
      schema: contactExtractionSchema,
      input,
      requestPrefix: "contactgen-extract",
      parseFailureMessage:
        "The note could not be read into structured contact fields. Try clearer wording, or fill the form in manually.",
    },
    deps,
  )
}
