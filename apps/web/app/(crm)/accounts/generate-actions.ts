"use server"

import { z } from "zod"
import { requireUser } from "@/lib/security/auth"
import { extractAccountFromText } from "@/lib/ai/account-extraction"
import {
  resolveExtractedAccount,
  type AccountPrefill,
} from "@/lib/data/account-extraction-resolver"
import type { FieldResolution } from "@/lib/data/opportunity-extraction-resolver"

// Account Generator — server action (ORR-733, Track A of ORR-732). Chains the
// account extractor → resolver under the authenticated user, returning a
// form-ready prefill + per-field resolution for the review UI. NEVER creates an
// account — the user confirms the pre-filled form, which goes through the existing
// createAccount path.

const imageInputSchema = z.object({
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  dataBase64: z.string().min(1).max(20_000_000),
})

const inputSchema = z
  .object({
    text: z.string().max(200_000).optional(),
    images: z.array(imageInputSchema).min(1).max(4).optional(),
  })
  .refine(
    (v) => (v.text?.trim().length ?? 0) > 0 || (v.images?.length ?? 0) > 0,
    { message: "Paste or drop a note or image first." },
  )

export interface GenerateAccountResult {
  ok: boolean
  prefill?: AccountPrefill
  resolution?: Record<string, FieldResolution>
  notes?: string[]
  model?: string | null
  truncated?: boolean
  /** No AI provider configured — the UI shows a "configure a provider" hint. */
  unconfigured?: boolean
  error?: string
}

export async function generateAccountAction(raw: unknown): Promise<GenerateAccountResult> {
  const user = await requireUser()

  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." }
  }

  const extraction = await extractAccountFromText({
    text: parsed.data.text,
    images: parsed.data.images,
    userId: user.id,
  })
  if (!extraction.ok || !extraction.fields) {
    return { ok: false, unconfigured: extraction.unconfigured, error: extraction.error }
  }

  const resolved = await resolveExtractedAccount({ user, source: "web" }, extraction.fields)

  return {
    ok: true,
    prefill: resolved.prefill,
    resolution: resolved.resolution,
    notes: resolved.notes,
    model: extraction.model,
    truncated: extraction.truncated,
  }
}
