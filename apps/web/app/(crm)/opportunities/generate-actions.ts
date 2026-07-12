"use server"

import { z } from "zod"
import { requireUser } from "@/lib/security/auth"
import { extractOpportunityFromText } from "@/lib/ai/opportunity-extraction"
import {
  resolveExtractedOpportunity,
  type OpportunityPrefill,
  type FieldResolution,
} from "@/lib/data/opportunity-extraction-resolver"

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
  /** The document was clipped before extraction. */
  truncated?: boolean
  /** No AI provider configured — the UI shows a "configure a provider" hint. */
  unconfigured?: boolean
  error?: string
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
    truncated: extraction.truncated,
  }
}
