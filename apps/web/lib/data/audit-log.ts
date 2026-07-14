import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

// ORR-700 — read path for the audit-log viewer. audit_log is written by the
// audit.log_change() trigger; RLS restricts SELECT to admins, so callers must
// already be admin-gated (the page uses requireRole).

export interface AuditLogCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export type AuditOperation = "INSERT" | "UPDATE" | "DELETE"

export interface AuditLogEntry {
  id: string
  tableName: string
  rowId: string | null
  operation: AuditOperation
  changedFields: Record<string, unknown> | null
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  actorUserId: string | null
  actorName: string | null
  actorSource: string
  actorIp: string | null
  occurredAt: string
}

export interface AuditLogQuery {
  tableName?: string
  operation?: AuditOperation
  /** ISO timestamps (inclusive). */
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export interface AuditLogPage {
  entries: AuditLogEntry[]
  hasMore: boolean
}

const PAGE_SIZE = 50
const PAGE_MAX = 100

// Defense-in-depth: never surface credential columns in the viewer, even from
// historical rows written before the ORR-696 audit redaction landed.
const SECRET_KEYS = new Set([
  "api_key", "smtp_password", "resend_api_key",
  "embeddings_api_key", "generation_api_key", "access_token", "refresh_token",
])

function redact(data: unknown): Record<string, unknown> | null {
  if (data == null || typeof data !== "object") return null
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    // eslint-disable-next-line security/detect-object-injection -- key iterates the row's own keys
    out[key] = SECRET_KEYS.has(key) ? "[redacted]" : value
  }
  return out
}

interface AuditRow {
  id: string
  table_name: string
  row_id: string | null
  operation: AuditOperation
  changed_fields: unknown
  old_data: unknown
  new_data: unknown
  actor_user_id: string | null
  actor_source: string | null
  actor_ip: string | null
  occurred_at: string
}

function toEntry(row: AuditRow, names: Map<string, string>): AuditLogEntry {
  return {
    id: row.id,
    tableName: row.table_name,
    rowId: row.row_id,
    operation: row.operation,
    changedFields: redact(row.changed_fields),
    oldData: redact(row.old_data),
    newData: redact(row.new_data),
    actorUserId: row.actor_user_id,
    actorName: row.actor_user_id ? names.get(row.actor_user_id) ?? null : null,
    actorSource: row.actor_source ?? "system",
    actorIp: row.actor_ip,
    occurredAt: row.occurred_at,
  }
}

/** One page of audit entries, newest first, with the actor's name resolved. */
export async function getAuditLog(
  _ctx: AuditLogCallContext,
  query: AuditLogQuery = {},
): Promise<AuditLogPage> {
  const supabase = await createServerClient()
  const limit = Math.min(Math.max(query.limit ?? PAGE_SIZE, 1), PAGE_MAX)
  const offset = Math.max(query.offset ?? 0, 0)

  let q = supabase
    .from("audit_log")
    .select("id, table_name, row_id, operation, changed_fields, old_data, new_data, actor_user_id, actor_source, actor_ip, occurred_at")
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit) // limit+1 rows to detect a next page

  if (query.tableName) q = q.eq("table_name", query.tableName)
  if (query.operation) q = q.eq("operation", query.operation)
  if (query.from) q = q.gte("occurred_at", query.from)
  if (query.to) q = q.lte("occurred_at", query.to)

  const { data, error } = await q
  if (error) throw new Error(`Failed to load audit log: ${error.message}`)

  const rows = (data ?? []) as AuditRow[]
  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows

  // Resolve actor display names in one lookup (no FK to embed on).
  const actorIds = [...new Set(pageRows.map((r) => r.actor_user_id).filter((v): v is string => !!v))]
  const names = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: users } = await supabase.from("users").select("id, full_name").in("id", actorIds)
    for (const u of (users ?? []) as { id: string; full_name: string | null }[]) {
      if (u.full_name) names.set(u.id, u.full_name)
    }
  }

  return { entries: pageRows.map((r) => toEntry(r, names)), hasMore }
}

/** Distinct table names present in the log (server-side DISTINCT — no truncation). */
export async function getAuditTableNames(_ctx: AuditLogCallContext): Promise<string[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc("audit_log_table_names")
  if (error) throw new Error(`Failed to load audit table names: ${error.message}`)
  return (data ?? []).map((r: { table_name: string }) => r.table_name)
}
