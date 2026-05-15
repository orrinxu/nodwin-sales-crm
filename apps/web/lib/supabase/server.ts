import "server-only"
import { createServerClient as createSsrClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { env } from "../security/env"

export async function createServerClient() {
  const cookieStore = await cookies()
  const key =
    process.env.NEXT_PUBLIC_ENV === "local-preview"
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
