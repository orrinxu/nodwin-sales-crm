import "server-only"
import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Per-request context for REST-API-token callers. When set, the shared
 * `createServerClient()` builds a Supabase client authed with this minted
 * per-user JWT instead of the browser session cookie — so Postgres RLS runs as
 * the token's owner. Web (cookie) requests never set this, so their path is
 * unchanged.
 */
interface ApiUserContext {
  jwt: string
  userId: string
}

const storage = new AsyncLocalStorage<ApiUserContext>()

export function runWithApiUser<T>(ctx: ApiUserContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn)
}

/** The minted JWT for the current API-token request, or undefined for web requests. */
export function getApiUserJwt(): string | undefined {
  return storage.getStore()?.jwt
}
