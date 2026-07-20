import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { env } from "@/lib/security/env"
import { requireUser } from "@/lib/security/auth"
import { createServerClient } from "@/lib/supabase/server"
import { encryptToken } from "@/lib/security/token-crypto"
import { exchangeCode } from "@/lib/integrations/google/oauth-client"
import {
  verifyOAuthState,
  OAUTH_STATE_COOKIE,
} from "@/lib/integrations/google/oauth-state"

/**
 * Per-user Google OAuth — callback handler (ORR-773 / ORR-819).
 *
 * GET /api/integrations/google/callback?code=...&state=...
 *
 * Verifies the CSRF `state` (signature + TTL + bound user + double-submit
 * cookie), exchanges the code for tokens, merges the newly granted scopes with
 * any existing ones (incremental auth), encrypts the tokens at rest, and upserts
 * the caller's own `google_oauth_connections` row via the AUTHENTICATED server
 * client (own-row RLS). Every failure path lands the user on
 * `/settings?google=error`; success on `/settings?google=connected`. Token
 * values are never logged.
 */

function settingsRedirect(status: "connected" | "error"): NextResponse {
  return NextResponse.redirect(
    new URL(`/settings?google=${status}`, env.APP_URL),
    302,
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // 1. Google-side error (user declined consent, etc.) — bail before anything.
  if (searchParams.get("error")) {
    return settingsRedirect("error")
  }

  const code = searchParams.get("code")
  const state = searchParams.get("state")
  if (!code || !state) {
    return settingsRedirect("error")
  }

  // 2. Must be the same authenticated user who started the flow.
  let userId: string
  try {
    const user = await requireUser(request)
    userId = user.id
  } catch {
    return settingsRedirect("error")
  }

  // 3. Verify the signed state, its binding to this user, and the nonce cookie.
  let stateNonce: string
  try {
    const payload = await verifyOAuthState(state)
    if (payload.sub !== userId) {
      return settingsRedirect("error")
    }
    stateNonce = payload.nonce
  } catch {
    return settingsRedirect("error")
  }

  const cookieNonce = request.cookies.get(OAUTH_STATE_COOKIE)?.value
  if (!cookieNonce || cookieNonce !== stateNonce) {
    return settingsRedirect("error")
  }

  // 4. Exchange the authorization code for tokens.
  let tokens
  try {
    tokens = await exchangeCode(code)
  } catch {
    return settingsRedirect("error")
  }

  const supabase = await createServerClient()

  // 5. Look at any existing connection to support incremental auth + refresh
  //    preservation (Google only returns a refresh token on first consent).
  const { data: existing } = await supabase
    .from("google_oauth_connections")
    .select("granted_scopes, refresh_token_enc")
    .eq("user_id", userId)
    .maybeSingle()

  const existingRefreshEnc = existing?.refresh_token_enc ?? null

  // No refresh token now AND none stored => Google never granted offline access.
  // We can't operate on the user's behalf later, so treat it as a failed connect.
  if (!tokens.refreshToken && !existingRefreshEnc) {
    return settingsRedirect("error")
  }

  // 6. Merge scopes (incremental auth). Prefer Google's authoritative grant if
  //    present, else fall back to what the flow requested.
  const grantedNow = tokens.scope
    ? tokens.scope.split(/\s+/).filter(Boolean)
    : []
  const mergedScopes = Array.from(
    new Set([...(existing?.granted_scopes ?? []), ...grantedNow]),
  )

  // 7. Encrypt tokens at rest. Preserve the stored refresh token if Google
  //    didn't hand back a new one.
  const accessTokenEnc = tokens.accessToken
    ? encryptToken(tokens.accessToken)
    : null
  const refreshTokenEnc = tokens.refreshToken
    ? encryptToken(tokens.refreshToken)
    : existingRefreshEnc

  // 8. Upsert the caller's own row. Own-row RLS lets the authenticated user
  //    insert/update only their own row; no service-role client here.
  //    `google_account_email` is intentionally omitted (left null / preserved) —
  //    we don't request an identity scope, so we can't reliably resolve it.
  const { error: upsertError } = await supabase
    .from("google_oauth_connections")
    .upsert(
      {
        user_id: userId,
        access_token_enc: accessTokenEnc,
        refresh_token_enc: refreshTokenEnc,
        access_token_expires_at: tokens.expiryDate
          ? new Date(tokens.expiryDate).toISOString()
          : null,
        granted_scopes: mergedScopes,
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )

  if (upsertError) {
    return settingsRedirect("error")
  }

  const response = settingsRedirect("connected")
  // One-shot state — clear the double-submit cookie now that it's spent.
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/google",
    maxAge: 0,
  })
  return response
}
