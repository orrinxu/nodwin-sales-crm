import { getUser } from "@/lib/security/auth"
import { Sidebar } from "@/components/layout/sidebar"
import { CrmHeader } from "@/components/layout/crm-header"

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  if (!user) {
    throw new Error("Expected authenticated user in CRM layout; middleware should have redirected")
  }

  return (
    <div className="flex h-screen">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CrmHeader user={user} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
