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

function mapUser(user: { id: string; email?: string | null; app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> }): AuthenticatedUser {
  const role = (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined)
  return { id: user.id, email: user.email ?? undefined, role }
}

function createSupabaseClientForRequest(request?: NextRequest) {
  if (request) {
    return createServerClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      },
    )
  }
  return null
}

async function createSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
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

export async function getUser(
  request?: NextRequest,
): Promise<AuthenticatedUser | null> {
  if (env.NODE_ENV !== "production" && env.NEXT_PUBLIC_ENV === "local-preview") {
    return LOCAL_PREVIEW_ADMIN
  }

  const supabase = request
    ? createSupabaseClientForRequest(request)!
    : await createSupabaseClient()

  const { data } = await supabase.auth.getUser()
  if (!data.user) return null

  return mapUser(data.user)
}

export async function requireUser(
  request?: NextRequest,
): Promise<AuthenticatedUser> {
  const user = await getUser(request)
  if (!user) {
    throw new UnauthorisedError("Authentication required")
  }
  return user
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
