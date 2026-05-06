import "server-only"
import { createServerClient } from "@supabase/ssr"
import { env } from "../security/env"

export type AdminAlertType = "info" | "warning" | "error" | "deadletter"

export type AdminAlertInsert = {
  title: string
  message: string
  type: AdminAlertType
  metadata?: Record<string, unknown>
}

function createServiceRoleClient() {
  return createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export async function sendAdminAlert(
  alert: AdminAlertInsert,
  createdBy?: string,
): Promise<string> {
  const client = createServiceRoleClient()

  const { data, error } = await client
    .from("admin_alerts")
    .insert({
      title: alert.title,
      message: alert.message,
      type: alert.type,
      metadata: (alert.metadata ?? {}) as Record<string, unknown>,
      created_by: createdBy ?? "00000000-0000-0000-0000-000000000000",
    })
    .select("id")
    .single()

  if (error) throw error
  return data.id
}
