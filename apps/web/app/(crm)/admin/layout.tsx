import { requireUser, requireRole } from "@/lib/security/auth"
import { AdminNav } from "@/components/shell/admin-nav"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  requireRole(user, "admin")

  return (
    <div className="flex flex-1">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-muted/30 p-3 lg:block">
        <h2 className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Admin
        </h2>
        <AdminNav />
      </aside>
      <div className="flex flex-1 flex-col">
        {children}
      </div>
    </div>
  )
}
