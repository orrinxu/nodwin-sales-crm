import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { env } from "@/lib/security/env"
import { requireUser } from "@/lib/security/auth"
import { UnauthorisedError } from "@/lib/security/errors"
import {
  buildAuthUrl,
  GoogleOAuthNotConfiguredError,
} from "@/lib/integrations/google/oauth-client"
import {
  signOAuthState,
  OAUTH_STATE_COOKIE,
} from "@/lib/integrations/google/oauth-state"

/**
 * Per-user Google OAuth — authorize handler (ORR-773 / ORR-819).
 *
 * GET /api/integrations/google/authorize?scopes=<space|comma separated>
 *
 * Requires an authenticated user, validates the requested scopes against a
 * fixed allowlist, mints a signed CSRF `state`, drops the state nonce in an
 * httpOnly cookie (double-submit), and 302-redirects to Google's consent screen.
 */

/**
 * The only scopes this flow will ever request. Anything outside this list is
 * rejected so a crafted `?scopes=` cannot escalate the consent request. Kept to
 * the minimum the ORR-773 foundation needs (Drive read, Calendar events, Gmail
 * read + send).
 */
export const GOOGLE_OAUTH_SCOPE_ALLOWLIST: readonly string[] = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
]

/** Requested when the caller omits `scopes`. */
const DEFAULT_SCOPES: readonly string[] = [
  "https://www.googleapis.com/auth/drive.readonly",
]

/** Split a `scopes` query param that may be space- or comma-delimited and/or repeated. */
function parseRequestedScopes(params: URLSearchParams): string[] {
  const raw = params.getAll("scopes")
  const scopes = raw
    .flatMap((chunk) => chunk.split(/[\s,]+/))
    .map((s) => s.trim())
    .filter(Boolean)
  // De-dupe while preserving order.
  return Array.from(new Set(scopes))
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)

    const { searchParams } = new URL(request.url)
    const requested = parseRequestedScopes(searchParams)
    const scopes = requested.length > 0 ? requested : [...DEFAULT_SCOPES]

    const invalid = scopes.filter(
      (s) => !GOOGLE_OAUTH_SCOPE_ALLOWLIST.includes(s),
    )
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unsupported Google OAuth scope(s): ${invalid.join(", ")}` },
        { status: 400 },
      )
    }

    const { state, nonce } = await signOAuthState({ userId: user.id, scopes })

    const authUrl = buildAuthUrl({ scopes, state })
    const response = NextResponse.redirect(authUrl, 302)
    response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integrations/google",
      maxAge: 600,
    })
    return response
  } catch (error) {
    if (error instanceof UnauthorisedError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    if (error instanceof GoogleOAuthNotConfiguredError) {
      // Env not wired — surface it on the settings page rather than a raw 500.
      return NextResponse.redirect(new URL("/settings?google=error", env.APP_URL), 302)
    }
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
