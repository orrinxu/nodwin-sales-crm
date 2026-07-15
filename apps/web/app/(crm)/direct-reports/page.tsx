import { requireUser } from "@/lib/security/auth"
import { getManagerRoster } from "@/lib/data/direct-reports"
import { DirectReportsRoster } from "@/components/direct-reports/direct-reports-roster"

export const dynamic = "force-dynamic"

// "Direct reports" self-service roster (ORR-715). Managers manage their own
// reporting line without an admin round-trip. Non-managers get an empty state.
export default async function DirectReportsPage() {
  const user = await requireUser()
  const roster = await getManagerRoster({ user: { id: user.id } })

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Direct reports</h1>
        <p className="text-sm text-muted-foreground">
          Manage who reports to you. Changes are logged, and reassigning a rep notifies their previous manager.
        </p>
      </div>

      {roster.isManager ? (
        <DirectReportsRoster directReports={roster.directReports} manageableReps={roster.manageableReps} />
      ) : (
        <p className="text-sm text-muted-foreground">
          You don&apos;t manage a team. Only managers can maintain a direct-reports roster.
        </p>
      )}
    </div>
  )
}
