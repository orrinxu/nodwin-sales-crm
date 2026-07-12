import { requireUser } from "@/lib/security/auth"
import { getUserPreferences } from "@/lib/data/user-preferences"
import { Sidebar } from "@/components/layout/sidebar"
import { CrmHeader } from "@/components/layout/crm-header"
import { PreferencesProvider } from "@/components/providers/preferences-provider"

// Every route in this group is authenticated (requireUser reads cookies) and
// renders per-request live data, so none should be statically prerendered.
// Without this, `next build` tries to prerender them and the env access in
// requireUser throws a ZodError before Next can detect the dynamic cookie usage.
export const dynamic = "force-dynamic"

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  const preferences = await getUserPreferences({ user, source: "web" })

  return (
    <PreferencesProvider
      dateFormat={preferences.dateFormat}
      timezone={preferences.timezone}
    >
      <div className="flex h-screen">
        <Sidebar user={user} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <CrmHeader user={user} />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </PreferencesProvider>
  )
}
