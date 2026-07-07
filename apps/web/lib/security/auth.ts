/* eslint-disable custom/require-auth-import -- this file IS the auth module */
import "server-only"
import { cache } from "react"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import { env } from "./env"
import { ForbiddenError, UnauthorisedError } from "./errors"
import { createServerClient as createAppServerClient } from "@/lib/supabase/server"
import {
  PERMISSION_KEYS,
  isPermissionKey,
  type PermissionKey,
} from "@/lib/data/permissions"

export interface AuthenticatedUser {
  id: string
  email: string | undefined
  role: string | undefined
}

const LOCAL_PREVIEW_ADMIN: AuthenticatedUser = {
  // Matches the seeded alice.admin user. The previous value was a malformed
  // UUID (an extra digit group), which broke any query that filters a uuid
  // column by the current user id (e.g. user_preferences). Local-preview only.
  id: "a0000001-0001-0001-0001-000000000001",
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

  // Resolve the role from the system of record (public.users) via the
  // SECURITY DEFINER current_user_role() RPC. The previous app_metadata.role /
  // user_metadata.role claim was never populated (there is no custom
  // access-token hook), so every app-layer requireRole() check saw undefined.
  let role: string | undefined
  const { data: roleData } = await supabase.rpc("current_user_role")
  if (typeof roleData === "string") {
    role = roleData
  }

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

// Two-tier admin (SOW §3 / org-admin settings):
//   Super Admin ('admin')        — group-wide + all entities.
//   Entity Admin ('entity_admin') — only their own entity (RLS enforces which).
export function isSuperAdmin(user: AuthenticatedUser): boolean {
  return user.role === "admin"
}

export function isEntityAdmin(user: AuthenticatedUser): boolean {
  return user.role === "entity_admin"
}

// Admits either admin tier. Use for surfaces both can reach; RLS + per-action
// checks confine an Entity Admin to their own entity. Group-wide actions must
// still use requireRole(user, "admin").
export function requireAdminAccess(user: AuthenticatedUser): void {
  if (!isSuperAdmin(user) && !isEntityAdmin(user)) {
    throw new ForbiddenError(
      `Requires admin access, got '${user.role ?? "none"}'`,
    )
  }
}

// ── Permissions (roles × permission matrix; see lib/data/permissions.ts) ────────
//
// Super Admin ('admin') always passes BEFORE any DB round-trip — this matches the
// DB has_permission() short-circuit AND is what keeps the LOCAL_PREVIEW_ADMIN
// (which has no real users row) working. Non-admins are resolved once per request
// via the my_permissions() RPC, cached with React cache().

/** The current user's permission key set (all keys for Super Admin). Cached per request. */
export const getMyPermissions = cache(
  async (user: AuthenticatedUser): Promise<Set<PermissionKey>> => {
    if (user.role === "admin") return new Set(PERMISSION_KEYS)
    const supabase = await createAppServerClient()
    const { data } = await supabase.rpc("my_permissions")
    const keys = ((data ?? []) as string[]).filter(isPermissionKey)
    return new Set(keys)
  },
)

export async function hasPermission(
  user: AuthenticatedUser,
  key: PermissionKey,
): Promise<boolean> {
  if (user.role === "admin") return true
  return (await getMyPermissions(user)).has(key)
}

/** Throw ForbiddenError unless the user holds `key`. */
export async function requirePermission(
  user: AuthenticatedUser,
  key: PermissionKey,
): Promise<void> {
  if (!(await hasPermission(user, key))) {
    throw new ForbiddenError(
      `Requires permission '${key}', got role '${user.role ?? "none"}'`,
    )
  }
}
