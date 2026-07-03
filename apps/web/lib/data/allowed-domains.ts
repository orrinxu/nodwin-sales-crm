import "server-only"
import { z } from "zod"
import { createServerClient } from "@supabase/ssr"
import type { Database } from "@/lib/database.types"
import { env } from "../security/env"
import type { AuthenticatedUser } from "@/lib/security/auth"

export interface AllowedDomainCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export interface AllowedDomainRecord {
  id: string
  domain: string
  createdAt: string
}

// Strip a pasted scheme / path / leading "@" and lowercase, so an admin can
// paste "https://Nodwin.com/" or "@nodwin.com" and still get "nodwin.com".
export function normalizeDomain(raw: string): string {
  let value = raw.trim().toLowerCase()
  const schemeIndex = value.indexOf("://")
  if (schemeIndex !== -1) value = value.slice(schemeIndex + 3)
  value = value.replace(/^@/, "")
  value = value.split("/")[0]
  return value.trim()
}

// Validate per label with simple, linear regexes (a single anchored domain
// regex trips the ReDoS linter). Requires at least one dot and a 2+ char
// alphabetic TLD: matches nodwin.com, trinitygaming.in, mail.nodwin.co.uk;
// rejects "nodwin", "user@nodwin.com", "nod win.com".
const LABEL_RE = /^[a-z0-9-]+$/
const TLD_RE = /^[a-z]{2,}$/

export function isValidDomain(value: string): boolean {
  if (value.length < 1 || value.length > 253) return false
  const labels = value.split(".")
  if (labels.length < 2) return false
  for (const label of labels) {
    if (label.length < 1 || label.length > 63) return false
    if (!LABEL_RE.test(label)) return false
    if (label.startsWith("-") || label.endsWith("-")) return false
  }
  return TLD_RE.test(labels[labels.length - 1])
}

export const allowedDomainCreateSchema = z.object({
  domain: z
    .string()
    .min(1, "Domain is required")
    .transform((v) => normalizeDomain(v))
    .refine((v) => isValidDomain(v), "Enter a valid domain, e.g. nodwin.com"),
})

export type AllowedDomainCreateInput = z.input<typeof allowedDomainCreateSchema>

// auth_allowed_domains has service_role-only RLS (it gates sign-in), so it is
// intentionally unreadable/unwritable by the authenticated app client. These
// functions use the service-role client and are only ever reached through
// server actions that require the admin role. Mirrors lib/notifications/admin-alerts.ts.
function createServiceRoleClient() {
  return createServerClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

function toDomainRecord(data: Record<string, unknown>): AllowedDomainRecord {
  return {
    id: data.id as string,
    domain: data.domain as string,
    createdAt: data.created_at as string,
  }
}

export async function getAllAllowedDomains(
  ctx: AllowedDomainCallContext,
): Promise<AllowedDomainRecord[]> {
  void ctx
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from("auth_allowed_domains")
    .select("*")
    .order("domain", { ascending: true })

  if (error) {
    throw new Error(`Failed to load allowed domains: ${error.message}`)
  }

  return (data ?? []).map((r) => toDomainRecord(r as Record<string, unknown>))
}

export async function createAllowedDomain(
  ctx: AllowedDomainCallContext,
  input: AllowedDomainCreateInput,
): Promise<AllowedDomainRecord> {
  void ctx
  const parsed = allowedDomainCreateSchema.parse(input)
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from("auth_allowed_domains")
    .insert({ domain: parsed.domain } as never)
    .select("*")
    .single()

  if (error) {
    // 23505 = unique_violation on the domain column.
    if (error.code === "23505") {
      throw new Error(`"${parsed.domain}" is already an allowed domain.`)
    }
    throw new Error(`Failed to add allowed domain: ${error.message}`)
  }

  return toDomainRecord(data as Record<string, unknown>)
}

export async function deleteAllowedDomain(
  ctx: AllowedDomainCallContext,
  id: string,
): Promise<void> {
  void ctx
  const supabase = createServiceRoleClient()

  // Refuse to remove the final domain — an empty allow-list would lock every
  // user out of sign-in (the OAuth callback rejects any domain not listed).
  const { count, error: countError } = await supabase
    .from("auth_allowed_domains")
    .select("*", { count: "exact", head: true })

  if (countError) {
    throw new Error(`Failed to check allowed domains: ${countError.message}`)
  }

  if ((count ?? 0) <= 1) {
    throw new Error(
      "Cannot remove the last allowed domain — at least one must remain or all sign-in is blocked.",
    )
  }

  const { error } = await supabase
    .from("auth_allowed_domains")
    .delete()
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to remove allowed domain: ${error.message}`)
  }
}
