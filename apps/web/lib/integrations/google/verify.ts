import "server-only"
import {
  getGoogleConnection,
  getValidGoogleAccessToken,
  GoogleNotConnectedError,
} from "./token-store"

/**
 * End-to-end proof of the ORR-773 per-user Google OAuth foundation (ORR-822).
 *
 * This module is the first *genuinely per-user* consumer of the token subsystem.
 * It deliberately does NOT touch `lib/integrations/drive/index.ts` — that seam is
 * SERVICE-ACCOUNT based (ORR-620) and takes only a file id with no user context,
 * so it can never prove per-user OAuth. Instead `verifyGoogleAccess` exercises the
 * full path a real per-user consumer would: read connection metadata → obtain a
 * live (auto-refreshed) access token via the token-store → make one lightweight
 * authenticated Google Drive API call and return the caller's Google identity.
 *
 * It never logs or returns token values; the only outward data is the non-secret
 * Google user object from the `about` endpoint.
 */

/** Scope required for the cheap read below; the first foundation scope granted. */
export const VERIFY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"

/** Drive `about` endpoint — the cheapest authenticated read that proves a token works. */
const DRIVE_ABOUT_URL =
  "https://www.googleapis.com/drive/v3/about?fields=user"

/** The Google `about.user` object (a non-secret identity DTO). */
export interface GoogleUser {
  emailAddress?: string
  displayName?: string
  photoLink?: string
  permissionId?: string
  me?: boolean
  [key: string]: unknown
}

export interface VerifyGoogleAccessResult {
  ok: true
  googleUser: GoogleUser
}

/**
 * Raised when the Google API itself returns a non-2xx to our authenticated call.
 * Distinct from the token-store's typed errors (which are pre-flight, about the
 * connection state) — this means the token was accepted by our subsystem but the
 * upstream request failed.
 */
export class GoogleApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "GoogleApiError"
    this.status = status
  }
}

/**
 * Prove per-user Google OAuth works end-to-end for `userId`.
 *
 * Flow: confirm a connection exists → get a live access token for the
 * `drive.readonly` scope (decrypt + refresh-if-needed happen inside the
 * token-store) → GET the Drive `about?fields=user` endpoint with the bearer
 * token → return the Google user object.
 *
 * @throws GoogleNotConnectedError   no connected Google account for the user.
 * @throws GoogleScopeMissingError   the connection lacks `drive.readonly`.
 * @throws GoogleReauthRequiredError refresh failed — the user must reconnect.
 * @throws GoogleApiError            the Drive API returned a non-2xx response.
 */
export async function verifyGoogleAccess(
  userId: string,
): Promise<VerifyGoogleAccessResult> {
  // Pre-flight: surface a clean "not connected" before we ever ask for a token.
  const connection = await getGoogleConnection(userId)
  if (!connection || !connection.connected) {
    throw new GoogleNotConnectedError()
  }

  // Obtain a live token. This decrypts the at-rest token, refreshes it when it is
  // missing / near expiry, and throws GoogleScopeMissingError / GoogleReauthRequiredError
  // as appropriate — all of which we propagate unchanged.
  const accessToken = await getValidGoogleAccessToken(userId, [VERIFY_SCOPE])

  const response = await fetch(DRIVE_ABOUT_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    // Never cache an authenticated per-user call.
    cache: "no-store",
  })

  if (!response.ok) {
    // Include Google's error body when it is small and textual — it is not secret
    // (it describes the failure, e.g. insufficient scope / rate limit). Never log
    // or echo the token.
    let detail = ""
    try {
      detail = (await response.text()).slice(0, 500)
    } catch {
      // ignore body read failures
    }
    throw new GoogleApiError(
      response.status,
      `Google Drive about request failed (${response.status})${
        detail ? `: ${detail}` : ""
      }`,
    )
  }

  const body = (await response.json()) as { user?: GoogleUser }
  return { ok: true, googleUser: body.user ?? {} }
}
