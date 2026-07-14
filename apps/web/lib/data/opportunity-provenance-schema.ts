import { z } from "zod"

// Shared (isomorphic) schema for AI-extraction provenance (ORR-682). Kept free of
// "server-only"/"use server" so the client generator can derive the payload type
// while the server action validates against the same schema. `feature` is NOT part
// of the client payload — the server action supplies it (EXTRACTION_FEATURE) so a
// client can't spoof which pipeline produced the extraction.

export const provenanceFieldSchema = z.object({
  status: z.string(),
  confidence: z.number().nullable(),
  source: z.string().nullable(),
  raw: z.string().nullable(),
})

export type ProvenanceField = z.infer<typeof provenanceFieldSchema>

export const extractionProvenanceSchema = z.object({
  opportunityId: z.string().uuid(),
  /** Resolved model string; null when the provider didn't report one. */
  model: z.string().nullable(),
  /** 'document' when an uploaded RFP file was the source (ORR-683), else 'text'. */
  sourceKind: z.enum(["document", "text"]),
  truncated: z.boolean(),
  notes: z.array(z.string()),
  /** Per create-form field → {status, confidence, source, raw}. */
  fields: z.record(z.string(), provenanceFieldSchema),
})

export type ExtractionProvenanceInput = z.infer<typeof extractionProvenanceSchema>
