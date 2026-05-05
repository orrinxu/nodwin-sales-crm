import "server-only"
import { createServerClient } from "@supabase/ssr"
import type { NextRequest } from "next/server"
import { env } from "./env"

export type AuditAction = "INSERT" | "UPDATE" | "DELETE"

export interface AuditParams {
  action: AuditAction
  table: string
  row_id: string
  actor?: { id: string; email?: string | null }
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  request?: NextRequest
}

export async function audit(params: AuditParams): Promise<void> {
  const client = createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )

  const { error } = await client.from("audit_log").insert({
    action: params.action,
    table_name: params.table,
    row_id: params.row_id,
    actor_id: params.actor?.id ?? null,
    actor_email: params.actor?.email ?? null,
    ip_address:
      params.request?.headers.get("x-forwarded-for") ??
      params.request?.headers.get("x-real-ip") ??
      null,
    user_agent: params.request?.headers.get("user-agent") ?? null,
    before: params.before ?? null,
    after: params.after ?? null,
  })

  if (error) {
    throw new Error(`audit: ${error.message}`)
  }
}
