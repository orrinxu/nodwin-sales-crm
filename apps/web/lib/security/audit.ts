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

/**
 * Write an entry to the audit_log table.
 *
 * Uses the service-role client so it bypasses RLS, matching the permissions
 * model of the audit.log_change() Postgres trigger function (SECURITY DEFINER).
 * Call this from API routes when you need to record an action that happens
 * outside of a DB trigger context.
 */
export async function audit(params: AuditParams): Promise<void> {
  const client = createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )

  const { error } = await client.from("audit_log").insert({
    operation: params.action,
    table_name: params.table,
    row_id: params.row_id,
    actor_user_id: params.actor?.id ?? null,
    actor_source: params.actor?.id ? "user" : "system",
    actor_ip:
      params.request?.headers.get("x-forwarded-for") ??
      params.request?.headers.get("x-real-ip") ??
      null,
    actor_user_agent: params.request?.headers.get("user-agent") ?? null,
    old_data: params.before ?? null,
    new_data: params.after ?? null,
  })

  if (error) {
    throw new Error(`audit: ${error.message}`)
  }
}
