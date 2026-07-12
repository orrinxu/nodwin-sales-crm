// Client-safe AI feature vocabulary (ORR-674).
//
// These are plain constants with no server-only dependencies, so both the
// server data layer (lib/data/ai-providers) and client components (the admin
// providers form) can import them. Keep this file free of server-only imports.

import type { AiFeature } from "./types"
import type { AiProviderName } from "@/lib/data/ai-providers"

/** All AI features (mirrors the `ai_feature` PG enum + the AiFeature TS union). */
export const AI_FEATURE_NAMES: AiFeature[] = [
  "search", "summarise_deal", "draft_email", "next_best_action", "opportunity_extraction", "other",
]

export const FEATURE_LABELS: Record<AiFeature, string> = {
  search: "Knowledge search",
  summarise_deal: "Deal summary",
  draft_email: "Email draft",
  next_best_action: "Next best action",
  opportunity_extraction: "Opportunity generator (document extraction)",
  other: "Other",
}

/** { feature -> provider } override map (ORR-674). Absent feature = use the global chain. */
export type FeatureProviderOverrides = Partial<Record<AiFeature, AiProviderName>>
