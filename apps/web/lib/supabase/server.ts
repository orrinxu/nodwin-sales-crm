import "server-only"
import type { Database } from "@/lib/database.types"
import { createServerClient as createSsrClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { env } from "../security/env"
import { getApiUserJwt } from "@/lib/api/request-user"

let warned = false

export async function createServerClient() {
  // REST-API-token path: a per-user JWT was minted upstream (see lib/api). Use a
  // stateless client authed with it — no cookies — so RLS runs as that user.
  const apiJwt = getApiUserJwt()
  if (apiJwt) {
    return createSsrClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      cookies: { getAll: () => [], setAll: () => {} },
      global: { headers: { Authorization: `Bearer ${apiJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  const cookieStore = await cookies()

  // Only use service_role for local/preview when NODE_ENV is not production
  const isLocalPreview =
    env.NODE_ENV !== "production" && env.NEXT_PUBLIC_ENV === "local-preview"

  if (isLocalPreview && !warned) {
    warned = true
    console.warn("[supabase] using service_role client for local-preview")
  }

  const key = isLocalPreview
    ? env.SUPABASE_SERVICE_ROLE_KEY
    : env.SUPABASE_ANON_KEY

  return createSsrClient<Database>(env.SUPABASE_URL, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Called from a Server Component, where cookies can't be written
          // (Next.js: "Cookies can only be modified in a Server Action or Route
          // Handler"). Safe to ignore — writes only matter in Server Actions /
          // Route Handlers, where set() succeeds and this catch never runs. This
          // stops a stray session-refresh write during a page render (e.g. a
          // getUser() call) from crashing the whole request.
        }
      },
    },
  })
}

/** The typed Supabase client shape callers get from {@link createServerClient}. */
export type ServerDbClient = Awaited<ReturnType<typeof createServerClient>>

/**
 * Stateless service-role client that BYPASSES RLS. For system/background jobs
 * only (no user session), e.g. the Drive-sync drain (ORR-698) which must read
 * every opportunity's visibility set. Never use this on a user-facing request —
 * it has no row-level protection. Cookie-less so it never mutates a session.
 */
export function createServiceRoleClient(): ServerDbClient {
  return createSsrClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
