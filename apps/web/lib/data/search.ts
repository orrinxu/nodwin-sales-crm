import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

// ORR-702 — global (header) search across opportunities, accounts and contacts.
// Runs three RLS-scoped ilike queries in parallel, so a user only ever sees rows
// they're allowed to (the Confidential-tier fence on opportunities applies via RLS).

export interface SearchCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export type GlobalSearchType = "opportunity" | "account" | "contact"

export interface GlobalSearchResult {
  type: GlobalSearchType
  id: string
  label: string
  sublabel: string | null
  href: string
}

const MIN_QUERY = 2
const PER_TYPE = 6

// Strip PostgREST filter delimiters (, ( )) and ilike wildcards (% _ \) so a
// stray character can't break the .or() filter or match everything. Collapses to
// spaces; a query that sanitises to <2 chars returns nothing.
function sanitize(raw: string): string {
  return raw.replace(/[%_,()\\*]/g, " ").replace(/\s+/g, " ").trim()
}

export async function globalSearch(
  _ctx: SearchCallContext,
  rawQuery: string,
): Promise<GlobalSearchResult[]> {
  const query = sanitize(rawQuery)
  if (query.length < MIN_QUERY) return []

  const supabase = await createServerClient()
  const like = `%${query}%`

  const [accountsRes, contactsRes, oppsRes] = await Promise.all([
    // ORR-804: exclude soft-deleted accounts — a deleted account would otherwise
    // match and link to /accounts/[id], which 404s (getAccountById filters them out).
    supabase.from("accounts").select("id, name, legal_name")
      .or(`name.ilike.${like},legal_name.ilike.${like},website.ilike.${like}`)
      .is("deleted_at", null)
      .order("name").limit(PER_TYPE),
    supabase.from("contacts").select("id, full_name, email")
      .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},title.ilike.${like}`)
      .order("full_name").limit(PER_TYPE),
    supabase.from("opportunities").select("id, name")
      .ilike("name", like).order("name").limit(PER_TYPE),
  ])

  for (const r of [accountsRes, contactsRes, oppsRes]) {
    if (r.error) throw new Error(`Search failed: ${r.error.message}`)
  }

  const results: GlobalSearchResult[] = []
  for (const a of (oppsRes.data ?? []) as { id: string; name: string }[]) {
    results.push({ type: "opportunity", id: a.id, label: a.name, sublabel: null, href: `/opportunities/${a.id}` })
  }
  for (const a of (accountsRes.data ?? []) as { id: string; name: string; legal_name: string | null }[]) {
    results.push({ type: "account", id: a.id, label: a.name, sublabel: a.legal_name, href: `/accounts/${a.id}` })
  }
  for (const c of (contactsRes.data ?? []) as { id: string; full_name: string; email: string | null }[]) {
    results.push({ type: "contact", id: c.id, label: c.full_name, sublabel: c.email, href: `/contacts/${c.id}` })
  }
  return results
}
