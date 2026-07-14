import { requireUser, requireRole } from "@/lib/security/auth"
import { getAuditLog, getAuditTableNames } from "@/lib/data/audit-log"
import { AuditLogList } from "@/components/admin/audit-log-list"
import { loadAuditLogAction } from "./actions"

export default async function AdminAuditPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [page, tables] = await Promise.all([
    getAuditLog(ctx),
    getAuditTableNames(ctx),
  ])

  return <AuditLogList initialPage={page} tables={tables} loadAction={loadAuditLogAction} />
}
