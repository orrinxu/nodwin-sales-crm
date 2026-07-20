import "server-only"
import { google } from "googleapis"
import { env } from "@/lib/security/env"

// Derive the OAuth2 client type from googleapis directly so we don't take a
// direct dependency on the transitive `google-auth-library` package (not
// resolvable under pnpm's strict node_modules).
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>

/**
 * Server-side Google OAuth2 client primitives (ORR-773 / ORR-818).
 *
 * These are the *pure* OAuth building blocks for the per-user authorization-code
 * flow: build an `OAuth2Client` from server-only env, generate the consent URL,
 * exchange an auth code for tokens, and refresh an access token. This is a
 * distinct path from the browser Drive Picker (NEXT_PUBLIC_* implicit token) and
 * from the Drive service account (lib/integrations/drive/service-account-auth.ts).
 *
 * By design this module does NO DB writes, NO requireUser / auth checks, and
 * touches NO Next.js request objects — callers own persistence, the `state`
 * value, and request wiring. Keeping it pure makes it trivially unit-testable
 * and reusable across route handlers and background jobs.
 */

/** Thrown when the server-side Google OAuth env vars are not fully configured. */
export class GoogleOAuthNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(
      `Google OAuth is not configured — set ${missing.join(", ")}. ` +
        "See .env.example (ORR-773).",
    )
    this.name = "GoogleOAuthNotConfiguredError"
  }
}

/** Tokens returned by exchanging an authorization code. */
export interface ExchangeCodeResult {
  accessToken: string | null
  refreshToken: string | null
  /** Epoch millis when the access token expires, or null if unknown. */
  expiryDate: number | null
  /** Space-delimited granted scopes, or null if not returned. */
  scope: string | null
}

/** Tokens returned by refreshing an access token. */
export interface RefreshAccessTokenResult {
  accessToken: string | null
  /** Epoch millis when the access token expires, or null if unknown. */
  expiryDate: number | null
}

/**
 * Build a configured `OAuth2Client` from the server-only env vars.
 *
 * @throws GoogleOAuthNotConfiguredError if any of the three vars is missing.
 */
export function getOAuth2Client(): OAuth2Client {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI

  const missing: string[] = []
  if (!clientId) missing.push("GOOGLE_OAUTH_CLIENT_ID")
  if (!clientSecret) missing.push("GOOGLE_OAUTH_CLIENT_SECRET")
  if (!redirectUri) missing.push("GOOGLE_OAUTH_REDIRECT_URI")
  if (missing.length > 0) {
    throw new GoogleOAuthNotConfiguredError(missing)
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

/**
 * Build the Google consent URL. Pure — the caller encodes whatever it needs
 * (e.g. the userId) into `state` and is responsible for verifying it on return.
 *
 * `access_type: 'offline'` + `prompt: 'consent'` ensures a refresh token is
 * issued; `include_granted_scopes: true` enables incremental authorization.
 */
export function buildAuthUrl({
  scopes,
  state,
}: {
  scopes: string[]
  state: string
}): string {
  return getOAuth2Client().generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: scopes,
    state,
  })
}

/** Exchange an authorization code for access/refresh tokens. */
export async function exchangeCode(code: string): Promise<ExchangeCodeResult> {
  const { tokens } = await getOAuth2Client().getToken(code)
  return {
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
    scope: tokens.scope ?? null,
  }
}

/** Exchange a stored refresh token for a fresh access token. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshAccessTokenResult> {
  const client = getOAuth2Client()
  client.setCredentials({ refresh_token: refreshToken })
  const { credentials } = await client.refreshAccessToken()
  return {
    accessToken: credentials.access_token ?? null,
    expiryDate: credentials.expiry_date ?? null,
  }
}
