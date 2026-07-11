import "server-only"
import type { NextRequest } from "next/server"
import { ZodError } from "zod"
import { resolveApiToken } from "@/lib/data/api-tokens"
import { mintUserJwt } from "./mint-jwt"
import { runWithApiUser } from "./request-user"
import { createServerClient } from "@/lib/supabase/server"
import { env } from "@/lib/security/env"
import { ForbiddenError, UnauthorisedError } from "@/lib/security/errors"

/** Structurally satisfies every domain `*CallContext` ({ user, source }). */
export interface ApiUserCtx {
  user: { id: string; email: string | undefined; role: string | undefined }
  source: "mcp"
}

function bearerToken(request: NextRequest): string | null {
  const h = request.headers.get("authorization")
  if (!h?.startsWith("Bearer ")) return null
  const t = h.slice("Bearer ".length).trim()
  return t.length > 0 ? t : null
}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status })
}

function statusForError(e: unknown): { status: number; message: string } {
  if (e instanceof ZodError) {
    return { status: 400, message: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }
  }
  if (e instanceof UnauthorisedError) return { status: 401, message: e.message }
  if (e instanceof ForbiddenError) return { status: 403, message: e.message }
  return { status: 500, message: e instanceof Error ? e.message : "Internal error" }
}

/**
 * Authenticate a REST-API request by its personal-access-token bearer, then run
 * `handler` inside a context where every `lib/data/*` call executes AS that user
 * under Postgres RLS (a short-lived JWT is minted and installed via AsyncLocal
 * storage — see lib/api/request-user + lib/supabase/server).
 */
export async function withApiUser(
  request: NextRequest,
  handler: (ctx: ApiUserCtx) => Promise<Response>,
): Promise<Response> {
  if (!env.SUPABASE_JWT_SECRET) {
    return jsonError(503, "API is not configured (SUPABASE_JWT_SECRET unset).")
  }
  const token = bearerToken(request)
  if (!token) {
    return jsonError(401, "Missing or malformed 'Authorization: Bearer <token>' header.")
  }

  const resolved = await resolveApiToken(token)
  if (!resolved) return jsonError(401, "Invalid, expired, or revoked token.")

  const jwt = await mintUserJwt(resolved.userId)
  return runWithApiUser({ jwt, userId: resolved.userId }, async () => {
    let role: string | undefined
    try {
      const sb = await createServerClient()
      const { data } = await sb.rpc("current_user_role")
      if (typeof data === "string") role = data
    } catch {
      // Role is advisory (RLS is the real boundary); proceed without it.
    }
    const ctx: ApiUserCtx = { user: { id: resolved.userId, email: undefined, role }, source: "mcp" }
    try {
      return await handler(ctx)
    } catch (e) {
      const { status, message } = statusForError(e)
      return jsonError(status, message)
    }
  })
}
