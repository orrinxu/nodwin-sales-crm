import "server-only"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import { env } from "./env"
import { ForbiddenError, UnauthorisedError } from "./errors"

export interface AuthenticatedUser {
  id: string
  email: string | undefined
  role: string | undefined
}

const LOCAL_PREVIEW_ADMIN: AuthenticatedUser = {
  id: "a0000000001-0001-0001-0001-000000000001",
  email: "alice.admin@nodwin-test.example",
  role: "admin",
}

export async function requireUser(
  request?: NextRequest,
): Promise<AuthenticatedUser> {
  if (env.NODE_ENV !== "production" && env.NEXT_PUBLIC_ENV === "local-preview") {
    return LOCAL_PREVIEW_ADMIN
  }

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
