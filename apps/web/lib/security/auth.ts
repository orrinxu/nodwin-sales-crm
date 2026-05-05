import "server-only"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import { parseEnv } from "./env"
import { ForbiddenError, UnauthorisedError } from "./errors"

export interface AuthenticatedUser {
  id: string
  email: string | undefined
  role: string | undefined
}

export async function requireUser(
  request?: NextRequest,
): Promise<AuthenticatedUser> {
  const env = parseEnv(process.env)

  let supabase
  if (request) {
    supabase = createServerClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => {
            const cookieHeader = request.headers.get("cookie") ?? ""
            return cookieHeader.split("; ").filter(Boolean).map((c) => {
              const eq = c.indexOf("=")
              return { name: c.slice(0, eq), value: c.slice(eq + 1) }
            })
          },
          setAll: () => {},
        },
      },
    )
  } else {
    const cookieStore = await cookies()
    supabase = createServerClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      },
    )
  }

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    throw new UnauthorisedError("Authentication required")
  }

  const user = data.user
  const role = (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined)

  return {
    id: user.id,
    email: user.email ?? undefined,
    role,
  }
}

export function requireRole(
  user: AuthenticatedUser,
  requiredRole: string,
): void {
  if (user.role !== requiredRole) {
    throw new ForbiddenError(
      `Requires role '${requiredRole}', got '${user.role ?? "none"}'`,
    )
  }
}
