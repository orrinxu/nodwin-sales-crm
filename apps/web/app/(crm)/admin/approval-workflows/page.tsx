import { requireUser, requireRole } from "@/lib/security/auth"
import { getApprovalWorkflows } from "@/lib/data/approval-workflows"
import { getAllEntities } from "@/lib/data/entities"
import { getUserOptions } from "@/lib/data/opportunities"
import { ApprovalWorkflowsList } from "@/components/admin/approval-workflows-list"
import {
  createApprovalWorkflowAction,
  updateApprovalWorkflowAction,
  deleteApprovalWorkflowAction,
  replaceWorkflowStepsAction,
} from "./actions"

export default async function AdminApprovalWorkflowsPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [workflows, entities, users] = await Promise.all([
    getApprovalWorkflows(ctx),
    getAllEntities(ctx),
    getUserOptions(ctx),
  ])

  return (
    <ApprovalWorkflowsList
      workflows={workflows}
      entityOptions={entities.map((e) => ({ id: e.id, name: e.name }))}
      userOptions={users.map((u) => ({ id: u.id, name: u.fullName }))}
      createAction={createApprovalWorkflowAction}
      updateAction={updateApprovalWorkflowAction}
      deleteAction={deleteApprovalWorkflowAction}
      replaceStepsAction={replaceWorkflowStepsAction}
    />
  )
}
