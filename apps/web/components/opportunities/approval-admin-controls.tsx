"use client"

import { useState } from "react"
import { UserCog, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { UserOption } from "@/lib/data/opportunities.types"

interface ApprovalAdminControlsProps {
  // The current pending step (for reassignment); null if none is actionable.
  stepId: string | null
  // The pending approval instance (for cancellation).
  instanceId: string
  users: UserOption[]
  pending: boolean
  onReassign: (stepId: string, userId: string) => void
  onCancel: (instanceId: string) => void
}

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

// Admin-only tools shown on a pending approval: reassign the current step to a
// different person, or cancel the whole approval.
export function ApprovalAdminControls({
  stepId,
  instanceId,
  users,
  pending,
  onReassign,
  onCancel,
}: ApprovalAdminControlsProps) {
  const [userId, setUserId] = useState("")

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-xs font-medium text-muted-foreground">Admin controls</p>
      {stepId && (
        <div className="flex items-center gap-2">
          <select
            className={`${SELECT_CLASS} flex-1`}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            aria-label="Reassign current step to"
          >
            <option value="">Reassign current step to…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={pending || !userId} onClick={() => onReassign(stepId, userId)}>
            <UserCog className="size-4" />
            Reassign
          </Button>
        </div>
      )}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => onCancel(instanceId)}>
        <Ban className="size-4" />
        Cancel approval
      </Button>
    </div>
  )
}
