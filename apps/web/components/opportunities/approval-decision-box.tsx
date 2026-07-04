"use client"

import { useState } from "react"
import { Check, SkipForward, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ApprovalDecisionBoxProps {
  stepId: string
  pending: boolean
  onDecide: (stepId: string, decision: "approved" | "rejected" | "skipped", comment: string) => void
}

// Shown to the approver whose turn it is on the current pending step.
export function ApprovalDecisionBox({ stepId, pending, onDecide }: ApprovalDecisionBoxProps) {
  const [comment, setComment] = useState("")

  return (
    <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-medium">This approval is waiting on you.</p>
      <textarea
        className="min-h-[60px] w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground"
        placeholder="Add a comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        aria-label="Approval comment"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onDecide(stepId, "approved", comment)} disabled={pending}>
          <Check className="size-4" />
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => onDecide(stepId, "rejected", comment)} disabled={pending}>
          <X className="size-4" />
          Reject
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDecide(stepId, "skipped", comment)} disabled={pending}>
          <SkipForward className="size-4" />
          Skip
        </Button>
      </div>
    </div>
  )
}
