import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/security/auth"
import { UnauthorisedError } from "@/lib/security/errors"
import { verifyGoogleAccess, GoogleApiError } from "@/lib/integrations/google/verify"
import {
  GoogleNotConnectedError,
  GoogleScopeMissingError,
  GoogleReauthRequiredError,
} from "@/lib/integrations/google/token-store"

/**
 * Per-user Google OAuth — end-to-end verify handler (ORR-822 / ORR-773).
 *
 * GET /api/integrations/google/verify
 *
 * Requires an authenticated user, then proves that user's Google connection
 * works end-to-end by making one lightweight authenticated Drive API call
 * (see lib/integrations/google/verify.ts). Returns the connected Google account
 * on success. Doubles as the future "Test connection" hook for the settings UI.
 *
 * Error mapping:
 *   401 — not authenticated (UnauthorisedError from requireUser)
 *   409 — no connected account, or refresh/reauth required (user action needed)
 *   403 — the connection is missing the required scope
 *   502 — Google returned a non-2xx to our authenticated call (upstream failure)
 *   500 — anything unexpected
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const { googleUser } = await verifyGoogleAccess(user.id)
    return NextResponse.json({ ok: true, googleUser })
  } catch (error) {
    if (error instanceof UnauthorisedError) {
      return NextResponse.json(
        { ok: false, error: "unauthorised", message: error.message },
        { status: 401 },
      )
    }
    if (error instanceof GoogleNotConnectedError) {
      return NextResponse.json(
        { ok: false, error: "not_connected", message: error.message },
        { status: 409 },
      )
    }
    if (error instanceof GoogleReauthRequiredError) {
      return NextResponse.json(
        { ok: false, error: "reauth_required", message: error.message },
        { status: 409 },
      )
    }
    if (error instanceof GoogleScopeMissingError) {
      return NextResponse.json(
        {
          ok: false,
          error: "scope_missing",
          message: error.message,
          missingScopes: error.missingScopes,
        },
        { status: 403 },
      )
    }
    if (error instanceof GoogleApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: "google_api_error",
          message: error.message,
          upstreamStatus: error.status,
        },
        { status: 502 },
      )
    }
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { ok: false, error: "internal_error", message },
      { status: 500 },
    )
  }
}
