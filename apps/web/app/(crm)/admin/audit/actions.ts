"use server"

import { requireUser, requireRole } from "@/lib/security/auth"
import { getAuditLog, type AuditLogQuery, type AuditLogPage } from "@/lib/data/audit-log"

// ORR-700 — admin-gated paging/filtering for the audit-log viewer. RLS already
// restricts audit_log to admins; requireRole makes the gate explicit and gives a
// clean 403 rather than a silent empty page for a non-admin.
export async function loadAuditLogAction(query: AuditLogQuery): Promise<AuditLogPage> {
  const user = await requireUser()
  requireRole(user, "admin")
  return getAuditLog({ user, source: "web" }, query)
}
