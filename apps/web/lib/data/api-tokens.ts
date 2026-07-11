import "server-only"
import { randomBytes, createHash, timingSafeEqual } from "node:crypto"
import { createServerClient as createSsrClient } from "@supabase/ssr"
import { createServerClient } from "@/lib/supabase/server"
import { env } from "@/lib/security/env"
import type { Database } from "@/lib/database.types"

export interface ApiTokenCallContext {
  user: { id: string }
  source: "web" | "mcp" | "webhook" | "system"
}

export interface ApiTokenRecord {
  id: string
  name: string
  tokenPrefix: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

const TOKEN_PREFIX = "nodpat_"

/** Service-role client for the pre-auth token lookup (validating a token is a
 *  session step, not a user data query — RLS can't run before we know the user). */
function serviceRoleClient() {
  return createSsrClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex")
}

function mapRow(r: Record<string, unknown>): ApiTokenRecord {
  return {
    id: r.id as string,
    name: r.name as string,
    tokenPrefix: r.token_prefix as string,
    createdAt: r.created_at as string,
    lastUsedAt: (r.last_used_at as string) ?? null,
    expiresAt: (r.expires_at as string) ?? null,
    revokedAt: (r.revoked_at as string) ?? null,
  }
}

/** Create a token for the caller. Returns the plaintext ONCE (never stored) plus
 *  the stored record. Runs under the caller's RLS (insert policy = own rows). */
export async function createApiToken(
  ctx: ApiTokenCallContext,
  input: { name: string; expiresInDays?: number | null },
): Promise<{ token: string; record: ApiTokenRecord }> {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 100) {
    throw new Error("Token name must be 1–100 characters.")
  }
  const plaintext = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
      : null

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("api_tokens")
    .insert({
      user_id: ctx.user.id,
      name,
      token_hash: hashToken(plaintext),
      token_prefix: plaintext.slice(0, 15),
      expires_at: expiresAt,
    })
    .select("*")
    .single()
  if (error || !data) {
    throw new Error(`Failed to create token: ${error?.message ?? "unknown"}`)
  }
  return { token: plaintext, record: mapRow(data as Record<string, unknown>) }
}

/** The caller's own tokens (RLS-scoped), newest first. Secrets are never returned. */
export async function listApiTokens(ctx: ApiTokenCallContext): Promise<ApiTokenRecord[]> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("api_tokens")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) throw new Error(`Failed to list tokens: ${error.message}`)
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

/** Revoke one of the caller's tokens (RLS-scoped update). */
export async function revokeApiToken(ctx: ApiTokenCallContext, id: string): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
  if (error) throw new Error(`Failed to revoke token: ${error.message}`)
}

/** Pre-auth: resolve a presented plaintext token to its owning user id, or null
 *  if unknown / revoked / expired. Service-role (no user context exists yet).
 *  Bumps last_used_at. The hash comparison is constant-time. */
export async function resolveApiToken(
  plaintext: string,
): Promise<{ userId: string; tokenId: string } | null> {
  if (!plaintext.startsWith(TOKEN_PREFIX)) return null
  const svc = serviceRoleClient()
  const { data, error } = await svc
    .from("api_tokens")
    .select("id, user_id, token_hash, revoked_at, expires_at")
    .eq("token_hash", hashToken(plaintext))
    .maybeSingle()
  if (error || !data) return null

  const row = data as Record<string, unknown>
  // Defence-in-depth: the lookup already matched on hash, but compare in
  // constant time so a match is never decided by early-exit timing.
  const presented = Buffer.from(hashToken(plaintext))
  const stored = Buffer.from(row.token_hash as string)
  if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) return null
  if (row.revoked_at) return null
  if (row.expires_at && new Date(row.expires_at as string).getTime() < Date.now()) return null

  await svc
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id as string)

  return { userId: row.user_id as string, tokenId: row.id as string }
}
