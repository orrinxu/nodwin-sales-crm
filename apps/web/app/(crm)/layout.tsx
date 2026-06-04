import { requireUser } from "@/lib/security/auth"
import { Sidebar } from "@/components/layout/sidebar"
import { CrmHeader } from "@/components/layout/crm-header"

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  return (
    <div className="flex h-screen">
      <Sidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <CrmHeader />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
