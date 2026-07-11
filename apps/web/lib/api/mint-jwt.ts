import "server-only"
import { SignJWT } from "jose"
import { env } from "@/lib/security/env"

// Short-lived — one JWT is minted per API request and discarded. It only needs
// to outlive a single request's queries.
const TTL_SECONDS = 300

/**
 * Mint a Supabase-compatible JWT for `userId`, signed with the self-host JWT
 * secret. Passed to PostgREST as the bearer token so RLS resolves
 * `auth.uid()` = userId with the `authenticated` role. Never leaves the server.
 */
export async function mintUserJwt(userId: string): Promise<string> {
  if (!env.SUPABASE_JWT_SECRET) {
    throw new Error("SUPABASE_JWT_SECRET is not configured — cannot mint API JWTs.")
  }
  const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret)
}
