import "server-only"
import type { ProviderAdapter } from "./types"
import { createAdaptersFromChain, type ProviderName } from "./providers"
import { resolveProviderChain } from "../data/ai-providers"

/**
 * The DB-driven adapters map for the general AI router (ORR-635). Resolves the
 * configured provider chain (primary first, then priority; env fallback) and
 * builds one adapter per usable provider. Insertion order = router call order.
 *
 * Use this at every general-router call site instead of createAdaptersFromEnv —
 * so an admin can point providers at endpoints/keys without a redeploy.
 */
export async function createProviderAdapters(): Promise<Map<ProviderName, ProviderAdapter>> {
  const chain = await resolveProviderChain()
  return createAdaptersFromChain(chain)
}
