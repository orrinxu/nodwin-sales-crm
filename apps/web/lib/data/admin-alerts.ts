import "server-only"
import { createServerClient } from "@/lib/supabase/server"

export type AdminAlertType = "info" | "warning" | "error" | "deadletter"

export interface AdminAlert {
  id: string
  title: string
  message: string
  type: AdminAlertType
  metadata: Record<string, unknown>
  acknowledgedAt: string | null
  createdBy: string
  createdAt: string
}

export interface AdminAlertsQueryInput {
  type?: AdminAlertType
  includeAcknowledged?: boolean
  limit?: number
  offset?: number
}

function toDomainAlert(data: Record<string, unknown>): AdminAlert {
  return {
    id: data.id as string,
    title: data.title as string,
    message: data.message as string,
    type: data.type as AdminAlertType,
    metadata: (data.metadata as Record<string, unknown>) ?? {},
    acknowledgedAt: (data.acknowledged_at as string | null) ?? null,
    createdBy: data.created_by as string,
    createdAt: data.created_at as string,
  }
}

export async function getAdminAlerts(
  input: AdminAlertsQueryInput = {},
): Promise<{ alerts: AdminAlert[]; total: number }> {
  const supabase = await createServerClient()

  const limit = Math.min(input.limit ?? 50, 200)
  const offset = input.offset ?? 0

  let query = supabase
    .from("admin_alerts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (!input.includeAcknowledged) {
    query = query.is("acknowledged_at", null)
  }

  if (input.type) {
    query = query.eq("type", input.type)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Failed to load admin alerts: ${error.message}`)
  }

  return {
    alerts: ((data ?? []) as Record<string, unknown>[]).map(toDomainAlert),
    total: count ?? 0,
  }
}

export async function getUnreadAlertCount(): Promise<number> {
  const supabase = await createServerClient()

  const { count, error } = await supabase
    .from("admin_alerts")
    .select("*", { count: "exact", head: true })
    .is("acknowledged_at", null)

  if (error) {
    throw new Error(`Failed to count unread alerts: ${error.message}`)
  }

  return count ?? 0
}

export async function acknowledgeAlert(id: string): Promise<void> {
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("admin_alerts")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", id)

  if (error) {
    throw new Error(`Failed to acknowledge alert: ${error.message}`)
  }
}

export async function acknowledgeAllAlerts(): Promise<void> {
  const supabase = await createServerClient()

  const { error } = await supabase
    .from("admin_alerts")
    .update({ acknowledged_at: new Date().toISOString() })
    .is("acknowledged_at", null)

  if (error) {
    throw new Error(`Failed to acknowledge all alerts: ${error.message}`)
  }
}
