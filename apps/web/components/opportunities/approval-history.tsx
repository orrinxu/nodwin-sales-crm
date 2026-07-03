import { Badge } from "@/components/ui/badge"
import type {
  ApprovalInstanceRecord,
  ApprovalInstanceStatus,
  ApprovalStepStatus,
} from "@/lib/data/approvals"

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function instanceBadgeVariant(
  status: ApprovalInstanceStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "approved":
      return "default"
    case "rejected":
      return "destructive"
    case "cancelled":
      return "outline"
    case "pending":
    default:
      return "secondary"
  }
}

function stepBadgeVariant(
  status: ApprovalStepStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "approved":
      return "default"
    case "rejected":
      return "destructive"
    case "skipped":
      return "outline"
    case "pending":
    default:
      return "secondary"
  }
}

interface ApprovalHistoryProps {
  instances: ApprovalInstanceRecord[]
}

export function ApprovalHistory({ instances }: ApprovalHistoryProps) {
  if (instances.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This opportunity has not been submitted for approval.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {instances.map((instance) => (
        <div key={instance.id} className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {instance.workflowName ?? "Approval"}
            </span>
            <Badge variant={instanceBadgeVariant(instance.status)} className="text-xs capitalize">
              {instance.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {instance.triggeredByName
              ? `Submitted by ${instance.triggeredByName} · ${formatDate(instance.createdAt)}`
              : `Submitted ${formatDate(instance.createdAt)}`}
          </p>

          {instance.steps.length > 0 && (
            <ol className="mt-3 space-y-2">
              {instance.steps.map((step) => (
                <li key={step.id} className="border-l-2 border-border pl-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">
                      {step.approverName ?? step.approverRole ?? `Step ${step.stepOrder + 1}`}
                    </span>
                    <Badge variant={stepBadgeVariant(step.status)} className="text-[10px] capitalize">
                      {step.status}
                    </Badge>
                  </div>
                  {step.decisions.map((decision) => (
                    <p key={decision.id} className="mt-1 text-[11px] text-muted-foreground">
                      <span className="capitalize">{decision.decision}</span>
                      {decision.decidedByName ? ` by ${decision.decidedByName}` : ""}
                      {` · ${formatDate(decision.createdAt)}`}
                      {decision.comment ? ` — ${decision.comment}` : ""}
                    </p>
                  ))}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  )
}
