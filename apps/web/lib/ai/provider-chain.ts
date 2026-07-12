import "server-only"
import type { AiFeature, ProviderAdapter } from "./types"
import { createAdaptersFromChain, type ProviderName } from "./providers"
import { resolveProviderChain } from "../data/ai-providers"

/**
 * The DB-driven adapters map for the general AI router (ORR-635). Resolves the
 * configured provider chain (primary first, then priority; env fallback) and
 * builds one adapter per usable provider. Insertion order = router call order.
 *
 * Pass `feature` (ORR-674) to honor a per-feature provider override — that
 * provider is moved to the front of the chain for this feature only. Omit it to
 * get the global chain.
 *
 * Use this at every general-router call site instead of createAdaptersFromEnv —
 * so an admin can point providers at endpoints/keys without a redeploy.
 */
export async function createProviderAdapters(feature?: AiFeature): Promise<Map<ProviderName, ProviderAdapter>> {
  const chain = await resolveProviderChain(feature)
  return createAdaptersFromChain(chain)
}
