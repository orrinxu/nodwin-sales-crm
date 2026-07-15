"use client"

import { useState, useTransition } from "react"
import { UserMinus, UserPlus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  assignDirectReportAction,
  removeDirectReportAction,
} from "@/app/(crm)/direct-reports/actions"

interface Person {
  id: string
  name: string
  email: string
}

// "My direct reports" roster (ORR-715). Managers claim/release sales_reps in their
// own entity/BU; the DB enforces the guardrail. Removal is effective-dated and
// notifies nobody here (the losing manager is notified server-side on a claim).
export function DirectReportsRoster({
  directReports,
  manageableReps,
}: {
  directReports: Person[]
  manageableReps: Person[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function run(id: string, action: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    setPendingId(id)
    startTransition(async () => {
      const res = await action(id)
      if (!res.ok) setError(res.error ?? "Something went wrong.")
      setPendingId(null)
    })
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <section>
        <h2 className="mb-3 text-sm font-semibold">My direct reports</h2>
        {directReports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No direct reports yet. Add reps from your team below.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {directReports.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendingId === p.id}
                  onClick={() => run(p.id, removeDirectReportAction)}
                >
                  {pendingId === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <UserMinus className="size-3.5" />}
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Add a direct report</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Sales reps in your entity{manageableReps.length === 0 ? "" : " and business unit"} you can add. Reassigning a rep notifies their current manager.
        </p>
        {manageableReps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No eligible reps to add right now.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {manageableReps.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={pendingId === p.id}
                  onClick={() => run(p.id, assignDirectReportAction)}
                >
                  {pendingId === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
