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
import { resolveAiConfig } from "@/lib/data/ai-settings"
import {
  createTranscriber,
  TranscriptionNotConfiguredError,
  TranscriptionUnavailableError,
} from "@/lib/ai/transcription"

// Opportunity Generator — server action (ORR-677, ticket 4/4).
//
// Chains the extraction service (ORR-675) → resolver (ORR-676) under the
// authenticated user, and returns a form-ready prefill + per-field resolution
// for the review UI. It NEVER creates an opportunity — the user confirms the
// pre-filled form, which goes through the existing createOpportunity path.

// ORR-686 vision input: a pasted/dropped screenshot analysed directly (no OCR).
const imageInputSchema = z.object({
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  // Base64 of an image up to ~15 MB (base64 inflates bytes ~4/3).
  dataBase64: z.string().min(1).max(20_000_000),
})

const inputSchema = z
  .object({
    // A generous cap; the extractor further bounds what it sends to the model.
    text: z.string().max(200_000).optional(),
    images: z.array(imageInputSchema).min(1).max(4).optional(),
  })
  .refine(
    (v) => (v.text?.trim().length ?? 0) > 0 || (v.images?.length ?? 0) > 0,
    { message: "Paste or drop a document or image first." },
  )

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

export interface TranscribeAudioResult {
  ok: boolean
  /** The transcribed text — fed into the same generate pipeline as a pasted note. */
  text?: string
  /** No transcription endpoint configured (or it's disabled) — UI shows an admin hint. */
  unconfigured?: boolean
  /** The endpoint was reachable but busy / timed out — the user can retry. */
  unavailable?: boolean
  error?: string
}

// Audio uploads are capped well below the document limit — a dictated note is a
// short clip. webm/opus is ~1 MB/min, so 25 MB is comfortably long.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

/**
 * Transcribe a recorded voice note (ORR-741, Track B) into text for the record
 * generators. Runs the shared transcription seam (ORR-737) under the authenticated
 * user; the resulting transcript becomes the `text` input to the existing
 * extraction pipeline — no new create path. Audio is ephemeral (gate G4): read
 * here, never stored. Entity-agnostic, so the account/contact generators share it.
 */
export async function transcribeAudioAction(formData: FormData): Promise<TranscribeAudioResult> {
  await requireUser()

  const file = formData.get("audio")
  if (!(file instanceof File)) return { ok: false, error: "No audio was provided." }
  if (file.size === 0) return { ok: false, error: "The recording was empty — try again." }
  if (file.size > MAX_AUDIO_BYTES) {
    return { ok: false, error: "That recording is too long — keep it under a few minutes." }
  }

  const cfg = await resolveAiConfig()
  if (!cfg.transcriptionEnabled || !cfg.transcription.baseUrl || !cfg.transcription.model) {
    return {
      ok: false,
      unconfigured: true,
      error: "Voice transcription isn't set up yet — ask an admin to configure it in Admin → AI.",
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    const { text } = await createTranscriber(cfg.transcription).transcribe({
      bytes,
      filename: file.name || "recording.webm",
      contentType: file.type || "audio/webm",
    })
    if (!text.trim()) {
      return { ok: false, error: "Couldn't hear anything in that recording. Try again, closer to the mic." }
    }
    return { ok: true, text }
  } catch (err) {
    if (err instanceof TranscriptionUnavailableError) {
      return { ok: false, unavailable: true, error: "The transcription service is busy. Please try again in a moment." }
    }
    if (err instanceof TranscriptionNotConfiguredError) {
      return { ok: false, unconfigured: true, error: err.message }
    }
    return { ok: false, error: "Couldn't transcribe that recording. Try again, or type the note instead." }
  }
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

  const extraction = await extractOpportunityFromText({
    text: parsed.data.text,
    images: parsed.data.images,
    userId: user.id,
  })
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
