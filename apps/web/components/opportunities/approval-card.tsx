"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ApprovalHistory } from "@/components/opportunities/approval-history"
import { ApprovalDecisionBox } from "@/components/opportunities/approval-decision-box"
import { ApprovalAdminControls } from "@/components/opportunities/approval-admin-controls"
import type { ApprovalInstanceRecord } from "@/lib/data/approvals"
import type { UserOption } from "@/lib/data/opportunities.types"

interface ApprovalCardProps {
  approvals: ApprovalInstanceRecord[]
  approvalStatus: string
  actionableStepId: string | null
  pendingInstanceId: string | null
  canAdmin: boolean
  userOptions: UserOption[]
  pending: boolean
  onDecide: (stepId: string, decision: "approved" | "rejected", comment: string) => void
  onReassign: (stepId: string, userId: string) => void
  onCancel: (instanceId: string) => void
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "Approved":
      return "default"
    case "Rejected":
      return "destructive"
    case "Cancelled":
      return "outline"
    case "Not submitted":
      return "secondary"
    case "Pending":
    default:
      return "secondary"
  }
}

export function ApprovalCard({
  approvals,
  approvalStatus,
  actionableStepId,
  pendingInstanceId,
  canAdmin,
  userOptions,
  pending,
  onDecide,
  onReassign,
  onCancel,
}: ApprovalCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span>Approval</span>
          <Badge variant={statusBadgeVariant(approvalStatus)} className="text-xs capitalize">
            {approvalStatus}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ApprovalHistory instances={approvals} />
        {actionableStepId && (
          <ApprovalDecisionBox
            stepId={actionableStepId}
            pending={pending}
            onDecide={onDecide}
          />
        )}
        {canAdmin && pendingInstanceId && (
          <ApprovalAdminControls
            stepId={actionableStepId}
            instanceId={pendingInstanceId}
            users={userOptions}
            pending={pending}
            onReassign={onReassign}
            onCancel={onCancel}
          />
        )}
      </CardContent>
    </Card>
  )
}
