"use server"

import { z } from "zod"
import { requireUser } from "@/lib/security/auth"
import { extractOpportunityFromText, EXTRACTION_FEATURE } from "@/lib/ai/opportunity-extraction"
import { extractText, UnsupportedMimeError, DOCX_MIME } from "@/lib/ingestion/extract"
import {
  resolveExtractedOpportunity,
  type OpportunityPrefill,
  type FieldResolution,
} from "@/lib/data/opportunity-extraction-resolver"
import { recordExtractionProvenance } from "@/lib/data/opportunity-provenance"
import { extractionProvenanceSchema } from "@/lib/data/opportunity-provenance-schema"

// Opportunity Generator — server action (ORR-677, ticket 4/4).
//
// Chains the extraction service (ORR-675) → resolver (ORR-676) under the
// authenticated user, and returns a form-ready prefill + per-field resolution
// for the review UI. It NEVER creates an opportunity — the user confirms the
// pre-filled form, which goes through the existing createOpportunity path.

const inputSchema = z.object({
  // A generous cap; the extractor further bounds what it sends to the model.
  text: z.string().min(1, "Paste or drop a document first.").max(200_000),
})

export interface GenerateOpportunityResult {
  ok: boolean
  prefill?: OpportunityPrefill
  resolution?: Record<string, FieldResolution>
  notes?: string[]
  /** Resolved extraction model, threaded to the confirm path for provenance (ORR-682). */
  model?: string | null
  /** The document was clipped before extraction. */
  truncated?: boolean
  /** No AI provider configured — the UI shows a "configure a provider" hint. */
  unconfigured?: boolean
  error?: string
}

export interface ExtractFileResult {
  ok: boolean
  text?: string
  error?: string
}

// Max upload the generator will read server-side. The extracted text still
// passes through generateOpportunityAction's 200k cap before hitting the model.
const MAX_FILE_BYTES = 50 * 1024 * 1024

function inferMime(name: string, type: string): string {
  if (type) return type
  const lower = name.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".docx")) return DOCX_MIME
  return "application/octet-stream"
}

/**
 * Extract plain text from an uploaded PDF / DOCX (or text file) for the
 * Opportunity Generator. Reuses the shared ingestion extractor. Text files are
 * read on the client; this handles the binary formats. Never creates anything.
 */
export async function extractDocumentTextAction(formData: FormData): Promise<ExtractFileResult> {
  await requireUser()

  const file = formData.get("file")
  if (!(file instanceof File)) return { ok: false, error: "No file provided." }
  if (file.size === 0) return { ok: false, error: "That file is empty." }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "That file is too large — max 50 MB." }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mimeType = inferMime(file.name, file.type)

  try {
    const segments = await extractText({ bytes, mimeType })
    const text = segments.map((s) => s.text).join("\n\n").trim()
    if (!text) {
      return { ok: false, error: "No readable text found — a scanned PDF has no text layer to read." }
    }
    return { ok: true, text }
  } catch (err) {
    if (err instanceof UnsupportedMimeError) {
      return { ok: false, error: "That file type isn't supported. Try a PDF, DOCX, or text file." }
    }
    return { ok: false, error: "Couldn't read that file. Try another, or paste the text below." }
  }
}

export async function generateOpportunityAction(raw: unknown): Promise<GenerateOpportunityResult> {
  const user = await requireUser()

  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." }
  }

  const extraction = await extractOpportunityFromText({ text: parsed.data.text, userId: user.id })
  if (!extraction.ok || !extraction.fields) {
    return { ok: false, unconfigured: extraction.unconfigured, error: extraction.error }
  }

  const resolved = await resolveExtractedOpportunity(
    { user, source: "web" },
    extraction.fields,
  )

  return {
    ok: true,
    prefill: resolved.prefill,
    resolution: resolved.resolution,
    notes: resolved.notes,
    model: extraction.model,
    truncated: extraction.truncated,
  }
}

// ORR-682 — record AI extraction provenance after the user confirms the
// AI-prefilled opportunity. Called (best-effort) from the generator's create
// wrapper with the new opportunity id; never on manual creates. `feature` is set
// server-side so a client can't claim a different pipeline produced the fields.
export async function recordExtractionProvenanceAction(
  raw: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()

  const parsed = extractionProvenanceSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid provenance payload." }
  }

  try {
    await recordExtractionProvenance(
      { user: { id: user.id } },
      { ...parsed.data, feature: EXTRACTION_FEATURE },
    )
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Provenance write failed." }
  }
}
