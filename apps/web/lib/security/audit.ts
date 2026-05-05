import "server-only"
import { createServerClient } from "@supabase/ssr"
import type { NextRequest } from "next/server"
import { parseEnv } from "./env"

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
  const env = parseEnv()
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
    actor_source: params.actor ? 'user' : 'system',
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
