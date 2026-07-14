import type { GenerateOpportunityResult } from "@/app/(crm)/opportunities/generate-actions"
import type { ExtractionProvenanceInput } from "@/lib/data/opportunity-provenance-schema"

// Client-safe orchestration for the two side effects of confirming an
// AI-generated opportunity (ORR-682 provenance + ORR-683 RFP retention). Kept out
// of the component and dependency-injected so it's unit-testable without a DOM or
// server modules. Both effects are BEST-EFFORT: the opportunity is already created
// by the time this runs, so a failure here is logged, never thrown — it must not
// block the create or trigger a duplicate on retry.

/** Build the provenance payload from the generator result (ORR-682). */
export function buildProvenanceInput(
  opportunityId: string,
  result: GenerateOpportunityResult,
  hasRfpFile: boolean,
): ExtractionProvenanceInput {
  const fields = Object.fromEntries(
    Object.entries(result.resolution ?? {}).map(([key, r]) => [
      key,
      {
        status: r.status,
        confidence: r.confidence ?? null,
        source: r.source ?? null,
        raw: r.raw ?? null,
      },
    ]),
  )
  return {
    opportunityId,
    model: result.model ?? null,
    sourceKind: hasRfpFile ? "document" : "text",
    truncated: result.truncated ?? false,
    notes: result.notes ?? [],
    fields,
  }
}

export interface GeneratorArtifactDeps {
  recordProvenance: (input: ExtractionProvenanceInput) => Promise<unknown>
  /** Attach the uploaded RFP file to the created opportunity as an `rfp` document. */
  uploadRfp: (opportunityId: string, file: File) => Promise<void>
}

/**
 * Persist provenance (when the create came from an AI generation) and retain the
 * uploaded RFP file (when one was the source). Both best-effort; errors are logged
 * and swallowed so the surrounding create flow always completes.
 */
export async function persistGeneratorArtifacts(args: {
  opportunityId: string
  result: GenerateOpportunityResult | null
  rfpFile: File | null
  deps: GeneratorArtifactDeps
}): Promise<void> {
  const { opportunityId, result, rfpFile, deps } = args

  // Provenance: only when this was an AI generation (result carries a resolution).
  if (result?.resolution && Object.keys(result.resolution).length > 0) {
    try {
      await deps.recordProvenance(buildProvenanceInput(opportunityId, result, rfpFile != null))
    } catch (err) {
      console.error("[opportunity-generator] provenance write failed", err)
    }
  }

  // Retention: only the uploaded RFP binary is kept (pasted text / text files
  // never set rfpFile), matching the ORR-683 policy.
  if (rfpFile) {
    try {
      await deps.uploadRfp(opportunityId, rfpFile)
    } catch (err) {
      console.error("[opportunity-generator] RFP file retention failed", err)
    }
  }
}
