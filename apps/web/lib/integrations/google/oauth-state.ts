import "server-only"
import { randomUUID } from "node:crypto"
import { SignJWT, jwtVerify } from "jose"
import { env } from "@/lib/security/env"

/**
 * Signed CSRF `state` for the per-user Google OAuth flow (ORR-773 / ORR-819).
 *
 * The `state` round-trips through Google: the authorize handler mints it, Google
 * echoes it back to the callback, and the callback verifies it before trusting
 * `code`. We sign it as an HS256 JWT with SUPABASE_JWT_SECRET (same key/pattern
 * as lib/api/mint-jwt.ts) so a forged or tampered state is rejected by signature,
 * and an old one by the short TTL. The payload binds the flow to the initiating
 * user (`sub`) and the requested `scopes`; `nonce` also lands in an httpOnly
 * cookie so the callback can do a double-submit check (the cookie can't be read
 * cross-site, so an attacker who replays a stolen `state` still can't match it).
 */

const TTL_SECONDS = 600 // 10 minutes — a consent screen shouldn't outlive this.
const AUDIENCE = "google-oauth-state"

/** Name of the httpOnly cookie carrying the state nonce for double-submit CSRF. */
export const OAUTH_STATE_COOKIE = "g_oauth_state"

/** The verified claims carried by an OAuth `state` token. */
export interface OAuthStatePayload {
  /** The user id that initiated the flow. */
  sub: string
  /** Random per-flow value; must match the double-submit cookie. */
  nonce: string
  /** Scopes the user asked to authorize. */
  scopes: string[]
}

function getSecret(): Uint8Array {
  if (!env.SUPABASE_JWT_SECRET) {
    throw new Error(
      "SUPABASE_JWT_SECRET is not configured — cannot sign/verify OAuth state.",
    )
  }
  return new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
}

/**
 * Mint a signed `state`. Returns the token plus the `nonce` embedded in it, which
 * the caller must also set as the {@link OAUTH_STATE_COOKIE} httpOnly cookie.
 */
export async function signOAuthState({
  userId,
  scopes,
  nonce = randomUUID(),
}: {
  userId: string
  scopes: string[]
  nonce?: string
}): Promise<{ state: string; nonce: string }> {
  const state = await new SignJWT({ nonce, scopes })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecret())
  return { state, nonce }
}

/**
 * Verify a `state` token. Throws if the signature is invalid, the token has
 * expired, the audience is wrong, or the payload shape is malformed. Callers are
 * still responsible for checking `sub` against the current user and `nonce`
 * against the double-submit cookie.
 */
export async function verifyOAuthState(state: string): Promise<OAuthStatePayload> {
  const { payload } = await jwtVerify(state, getSecret(), { audience: AUDIENCE })
  const { sub, nonce, scopes } = payload as Record<string, unknown>
  if (
    typeof sub !== "string" ||
    typeof nonce !== "string" ||
    !Array.isArray(scopes) ||
    !scopes.every((s) => typeof s === "string")
  ) {
    throw new Error("Malformed OAuth state payload")
  }
  return { sub, nonce, scopes: scopes as string[] }
}
