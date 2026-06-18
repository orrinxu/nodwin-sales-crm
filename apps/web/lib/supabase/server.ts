import "server-only"
import { createServerClient as createSsrClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { env } from "../security/env"

let warned = false

export async function createServerClient() {
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

  return createSsrClient(env.SUPABASE_URL, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
        })
      },
    },
  })
}
