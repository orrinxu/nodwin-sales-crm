import "server-only"
import { createServerClient as createSsrClient } from "@supabase/ssr"
import { env } from "@/lib/security/env"
import type { Database } from "@/lib/database.types"
import { decryptToken, encryptToken } from "@/lib/security/token-crypto"
import {
  getOAuth2Client,
  refreshAccessToken,
} from "./oauth-client"

/**
 * Server-side per-user Google token accessor + auto-refresh (ORR-820 / ORR-773).
 *
 * This is the READ side that every Google consumer (Drive / Calendar / Gmail)
 * calls to obtain a valid access token for a user. It:
 *   - reads/writes `public.google_oauth_connections` via a SERVICE-ROLE client
 *     (RLS-bypassing) so it works in background / refresh contexts with no user
 *     session. The table has OWN-ROW RLS and deliberately NO service_role
 *     policy — service-role bypasses RLS, which is exactly what we rely on here.
 *   - decrypts the at-rest tokens (token-crypto), refreshes the access token via
 *     the pure OAuth primitives (oauth-client) when it is missing / near expiry,
 *     and persists the fresh token.
 *
 * It never returns encrypted or plaintext refresh tokens to callers; the only
 * secret it hands back is a freshly-validated access token from
 * getValidGoogleAccessToken. Connection metadata is a non-secret DTO.
 */

/** Seconds of clock skew before actual expiry at which we proactively refresh. */
const EXPIRY_SKEW_MS = 60_000

/** No connected Google account for this user (no row, or status='revoked'). */
export class GoogleNotConnectedError extends Error {
  constructor(message = "No connected Google account for this user.") {
    super(message)
    this.name = "GoogleNotConnectedError"
  }
}

/** The connection exists but is missing one or more scopes the caller requires. */
export class GoogleScopeMissingError extends Error {
  readonly missingScopes: string[]
  constructor(missingScopes: string[]) {
    super(
      `Google connection is missing required scope(s): ${missingScopes.join(", ")}. ` +
        "The user must re-consent with the additional scope(s).",
    )
    this.name = "GoogleScopeMissingError"
    this.missingScopes = missingScopes
  }
}

/** The stored refresh token is no longer valid — the user must reconnect. */
export class GoogleReauthRequiredError extends Error {
  constructor(
    message = "Google refresh token is invalid or revoked — the user must reconnect.",
  ) {
    super(message)
    this.name = "GoogleReauthRequiredError"
  }
}

/** Non-secret view of a user's Google connection (safe to return to callers). */
export interface GoogleConnectionInfo {
  googleAccountEmail: string | null
  grantedScopes: string[]
  status: string
  accessTokenExpiresAt: string | null
  connected: boolean
}

type ConnectionRow =
  Database["public"]["Tables"]["google_oauth_connections"]["Row"]

/**
 * Service-role Supabase client. Reading/writing a user's token row is a session
 * step that must run without a user context (background refresh / jobs), so it
 * intentionally bypasses RLS — mirrors lib/data/api-tokens.ts.
 */
function serviceRoleClient() {
  return createSsrClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}

/** Fetch the raw row for a user, or null if none exists. */
async function fetchRow(userId: string): Promise<ConnectionRow | null> {
  const svc = serviceRoleClient()
  const { data, error } = await svc
    .from("google_oauth_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) {
    throw new Error(`Failed to read Google connection: ${error.message}`)
  }
  return (data as ConnectionRow | null) ?? null
}

/**
 * Return the non-secret connection metadata for a user, or null if there is no
 * row. Never returns tokens (encrypted or plaintext).
 */
export async function getGoogleConnection(
  userId: string,
): Promise<GoogleConnectionInfo | null> {
  const row = await fetchRow(userId)
  if (!row) return null
  return {
    googleAccountEmail: row.google_account_email,
    grantedScopes: row.granted_scopes ?? [],
    status: row.status,
    accessTokenExpiresAt: row.access_token_expires_at,
    connected: row.status === "connected",
  }
}

/**
 * True if the access token is absent, has no known expiry, or is within the
 * skew window of expiring — i.e. we should refresh before using it.
 */
function needsRefresh(expiresAt: string | null): boolean {
  if (!expiresAt) return true
  const expiresMs = new Date(expiresAt).getTime()
  if (Number.isNaN(expiresMs)) return true
  return expiresMs - EXPIRY_SKEW_MS <= Date.now()
}

/** Detect the Google "refresh token no longer valid" signal on a thrown error. */
function isInvalidGrant(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const anyErr = err as {
    message?: unknown
    response?: { data?: { error?: unknown } }
  }
  const responseError = anyErr.response?.data?.error
  if (typeof responseError === "string" && responseError === "invalid_grant") {
    return true
  }
  return (
    typeof anyErr.message === "string" &&
    anyErr.message.toLowerCase().includes("invalid_grant")
  )
}

/**
 * In-process single-flight: dedupe concurrent refreshes for the same user in
 * this runtime so N simultaneous callers issue at most one token refresh + one
 * DB write. This is best-effort per-instance (not cross-process); a second app
 * instance could still refresh independently, which Google tolerates.
 */
const inFlightRefreshes = new Map<string, Promise<string>>()

/** Perform the refresh + persist, returning the fresh plaintext access token. */
async function refreshAndPersist(
  userId: string,
  refreshTokenEnc: string,
): Promise<string> {
  const refreshToken = decryptToken(refreshTokenEnc)

  let refreshed: Awaited<ReturnType<typeof refreshAccessToken>>
  try {
    refreshed = await refreshAccessToken(refreshToken)
  } catch (err) {
    if (isInvalidGrant(err)) {
      // The refresh token is dead — mark the connection revoked and force reconnect.
      await serviceRoleClient()
        .from("google_oauth_connections")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
      throw new GoogleReauthRequiredError()
    }
    throw err
  }

  const newAccessToken = refreshed.accessToken
  if (!newAccessToken) {
    throw new Error("Google refresh returned no access token.")
  }

  const expiresAtIso = refreshed.expiryDate
    ? new Date(refreshed.expiryDate).toISOString()
    : null

  const { error } = await serviceRoleClient()
    .from("google_oauth_connections")
    .update({
      access_token_enc: encryptToken(newAccessToken),
      access_token_expires_at: expiresAtIso,
      status: "connected",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
  if (error) {
    throw new Error(`Failed to persist refreshed Google token: ${error.message}`)
  }

  return newAccessToken
}

/**
 * Return a valid Google access token for the user, refreshing transparently
 * when it is missing or near expiry.
 *
 * @throws GoogleNotConnectedError  no row, or status='revoked'.
 * @throws GoogleScopeMissingError  a required scope is not granted.
 * @throws GoogleReauthRequiredError  refresh failed with invalid_grant.
 */
export async function getValidGoogleAccessToken(
  userId: string,
  requiredScopes: string[],
): Promise<string> {
  const row = await fetchRow(userId)
  if (!row || row.status === "revoked") {
    throw new GoogleNotConnectedError()
  }

  const granted = new Set(row.granted_scopes ?? [])
  const missing = requiredScopes.filter((s) => !granted.has(s))
  if (missing.length > 0) {
    throw new GoogleScopeMissingError(missing)
  }

  if (!needsRefresh(row.access_token_expires_at) && row.access_token_enc) {
    return decryptToken(row.access_token_enc)
  }

  if (!row.refresh_token_enc) {
    // Nothing to refresh with — the user must reconnect (offline access lost).
    throw new GoogleReauthRequiredError(
      "No stored refresh token — the user must reconnect Google.",
    )
  }

  // Single-flight the refresh per user within this process.
  const existing = inFlightRefreshes.get(userId)
  if (existing) return existing

  const refreshTokenEnc = row.refresh_token_enc
  const promise = refreshAndPersist(userId, refreshTokenEnc).finally(() => {
    inFlightRefreshes.delete(userId)
  })
  inFlightRefreshes.set(userId, promise)
  return promise
}

/**
 * Disconnect Google for the user: best-effort revoke at Google, then delete the
 * stored row. A revoke failure (already-revoked token, network) never blocks the
 * local delete.
 */
export async function disconnectGoogle(userId: string): Promise<void> {
  const row = await fetchRow(userId)
  if (!row) return

  // Best-effort remote revoke. Prefer the refresh token (revoking it invalidates
  // the whole grant); fall back to the access token.
  const tokenEnc = row.refresh_token_enc ?? row.access_token_enc
  if (tokenEnc) {
    try {
      const token = decryptToken(tokenEnc)
      await getOAuth2Client().revokeToken(token)
    } catch {
      // Ignore — the token may already be invalid, or OAuth may be unconfigured.
    }
  }

  const { error } = await serviceRoleClient()
    .from("google_oauth_connections")
    .delete()
    .eq("user_id", userId)
  if (error) {
    throw new Error(`Failed to delete Google connection: ${error.message}`)
  }
}
