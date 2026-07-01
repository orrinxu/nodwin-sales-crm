import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllApprovalThresholds } from "@/lib/data/approval-thresholds"
import { getAllEntities } from "@/lib/data/entities"
import { ApprovalThresholdsList } from "@/components/admin/financial/approval-thresholds-list"
import {
  upsertApprovalThresholdAction,
  deleteApprovalThresholdAction,
} from "./actions"

export default async function AdminApprovalThresholdsPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [thresholds, entities] = await Promise.all([
    getAllApprovalThresholds(),
    getAllEntities(ctx),
  ])

  return (
    <ApprovalThresholdsList
      thresholds={thresholds}
      entities={entities}
      upsertAction={upsertApprovalThresholdAction}
      deleteAction={deleteApprovalThresholdAction}
    />
  )
}
