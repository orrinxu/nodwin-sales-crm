import { requireUser } from "@/lib/security/auth"
import { AppShell } from "@/components/shell/app-shell"

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  return <AppShell user={user}>{children}</AppShell>
}
