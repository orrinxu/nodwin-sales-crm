import { requireUser, requireRole } from "@/lib/security/auth"
import { FinancialSettingsNav } from "./nav"

export default async function FinancialSettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  requireRole(user, "admin")

  return (
    <div className="flex flex-1 flex-col">
      <FinancialSettingsNav />
      <div className="flex-1">{children}</div>
    </div>
  )
}
