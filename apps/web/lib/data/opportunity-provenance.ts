import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import {
  extractionProvenanceSchema,
  type ExtractionProvenanceInput,
} from "@/lib/data/opportunity-provenance-schema"

// ORR-682 — persist AI extraction provenance on the opportunity confirm path.
// Inserts under the caller's RLS-scoped client; the extraction_provenance_insert_self
// policy requires created_by = auth.uid(). Never called for manual creates.

export interface ProvenanceCallContext {
  user: { id: string }
}

export async function recordExtractionProvenance(
  ctx: ProvenanceCallContext,
  input: ExtractionProvenanceInput & { feature: string },
): Promise<void> {
  const parsed = extractionProvenanceSchema.parse(input)
  const supabase = await createServerClient()

  const { error } = await supabase.from("opportunity_extraction_provenance").insert({
    opportunity_id: parsed.opportunityId,
    feature: input.feature,
    model: parsed.model,
    source_kind: parsed.sourceKind,
    fields: parsed.fields,
    notes: parsed.notes,
    truncated: parsed.truncated,
    created_by: ctx.user.id,
    updated_by: ctx.user.id,
  })

  if (error) throw new Error(error.message)
}
