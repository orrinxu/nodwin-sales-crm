"use server"

import { requireUser } from "@/lib/security/auth"
import { globalSearch, type GlobalSearchResult } from "@/lib/data/search"

// ORR-702 — global search action for the header search box. Runs under the
// caller's RLS (requireUser → the authenticated Supabase client), so results are
// automatically scoped to what the user can see.
export async function globalSearchAction(query: string): Promise<GlobalSearchResult[]> {
  const user = await requireUser()
  return globalSearch({ user, source: "web" }, query)
}
