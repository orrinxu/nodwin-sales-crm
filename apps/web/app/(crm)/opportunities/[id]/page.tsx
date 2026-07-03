import { notFound } from "next/navigation"
import { requireUser, isSuperAdmin } from "@/lib/security/auth"
import {
  getOpportunityById,
  getBusinessUnitOptions,
  getOpportunitySplits,
  getOpportunityTeamMembers,
  getUserOptions,
} from "@/lib/data/opportunities"
import { getStageHistoryForOpportunity } from "@/lib/data/opportunity-stage-history"
import { getActivitiesForOpportunity } from "@/lib/data/activities"
import {
  getApprovalHistoryForOpportunity,
  getApprovalActionState,
  getEnforceGateStatus,
  approvalStatusLabel,
  summarizeApprovalStatus,
} from "@/lib/data/approvals"
import {
  updateOpportunityAction,
  updateOpportunityStageAction,
  createActivityAction,
  updateOpportunitySplitsAction,
  updateOpportunityTeamMembersAction,
  submitOpportunityForApprovalAction,
  recordApprovalDecisionAction,
  reassignApprovalStepAction,
  cancelApprovalInstanceAction,
} from "../actions"
import { OpportunityDetailWrapper } from "@/components/opportunities/opportunity-detail-wrapper"

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params

  const ctx = { user, source: "web" as const }

  const opportunity = await getOpportunityById(ctx, id)
  if (!opportunity) {
    notFound()
  }

  const [businessUnits, activities, splits, teamMembers, stageHistory, userOptions, approvals, approvalActionState, enforceGateStatus] =
    await Promise.all([
      getBusinessUnitOptions(ctx),
      getActivitiesForOpportunity(ctx, id),
      getOpportunitySplits(ctx, id),
      getOpportunityTeamMembers(ctx, id),
      getStageHistoryForOpportunity(ctx, id),
      getUserOptions(ctx),
      getApprovalHistoryForOpportunity(ctx, id),
      getApprovalActionState(ctx, id),
      getEnforceGateStatus(ctx, id, opportunity.stage),
    ])

  const approvalStatus = approvalStatusLabel(summarizeApprovalStatus(approvals))

  return (
    <OpportunityDetailWrapper
      opportunity={opportunity}
      businessUnits={businessUnits}
      updateAction={updateOpportunityAction}
      updateStageAction={updateOpportunityStageAction}
      activities={activities}
      createActivityAction={createActivityAction}
      splits={splits}
      teamMembers={teamMembers}
      stageHistory={stageHistory}
      userOptions={userOptions}
      approvals={approvals}
      approvalStatus={approvalStatus}
      canSubmitApproval={approvalActionState.canSubmit}
      actionableStepId={approvalActionState.actionableStepId}
      pendingApprovalInstanceId={approvalActionState.pendingInstanceId}
      canAdminApprovals={isSuperAdmin(user)}
      submitApprovalAction={submitOpportunityForApprovalAction}
      recordDecisionAction={recordApprovalDecisionAction}
      reassignApprovalAction={reassignApprovalStepAction}
      cancelApprovalAction={cancelApprovalInstanceAction}
      updateSplitsAction={updateOpportunitySplitsAction}
      updateTeamAction={updateOpportunityTeamMembersAction}
      enforceGateStatus={enforceGateStatus}
    />
  )
}
