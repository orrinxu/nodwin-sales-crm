import "server-only"
import { SignJWT, importPKCS8 } from "jose"
import { env } from "@/lib/security/env"

/**
 * Google service-account auth for server-side Drive access (ORR-698).
 *
 * Uses a service account with domain-wide delegation. Rather than pull in the
 * heavy `googleapis` SDK, we mint a signed JWT with `jose` (already a dependency)
 * and exchange it for an OAuth access token at Google's token endpoint — the
 * Drive REST API is then called directly with `fetch`. The token is cached in
 * module scope until shortly before expiry.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer"
// drive scope = full folder + permission management (create folders, share).
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri?: string
}

/** True when the service-account key is present — callers gate on this. */
export function isDriveConfigured(): boolean {
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_KEY)
}

function parseKey(): ServiceAccountKey {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) {
    throw new Error(
      "Google Drive is not configured — set GOOGLE_SERVICE_ACCOUNT_KEY to a service-account JSON key.",
    )
  }
  let parsed: ServiceAccountKey
  try {
    parsed = JSON.parse(raw) as ServiceAccountKey
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON.")
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is missing client_email or private_key.")
  }
  return parsed
}

let cached: { token: string; expiresAt: number } | null = null

/** Get a Drive OAuth access token, minting + caching a new one as needed. */
export async function getDriveAccessToken(): Promise<string> {
  const now = Date.now()
  // 60s safety margin so we never use a token that expires mid-request.
  if (cached && cached.expiresAt - 60_000 > now) return cached.token

  const key = parseKey()
  const iat = Math.floor(now / 1000)
  const exp = iat + 3600

  const claims: Record<string, unknown> = {
    scope: DRIVE_SCOPE,
    aud: key.token_uri ?? TOKEN_ENDPOINT,
  }
  // Domain-wide delegation: impersonate a real Workspace user when configured.
  if (env.GOOGLE_WORKSPACE_ADMIN_SUBJECT) {
    claims.sub = env.GOOGLE_WORKSPACE_ADMIN_SUBJECT
  }

  const privateKey = await importPKCS8(key.private_key, "RS256")
  const assertion = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(key.client_email)
    .setSubject(env.GOOGLE_WORKSPACE_ADMIN_SUBJECT ?? key.client_email)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(privateKey)

  const res = await fetch(key.token_uri ?? TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: GRANT_TYPE, assertion }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Google token exchange failed (${res.status}): ${detail.slice(0, 200)}`)
  }

  const body = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) {
    throw new Error("Google token exchange returned no access_token.")
  }

  cached = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
  }
  return cached.token
}

/** Test-only: clear the cached token so specs don't leak state. */
export function __resetDriveTokenCache(): void {
  cached = null
}
