import { notFound } from "next/navigation"
import { requireUser } from "@/lib/security/auth"
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
  approvalStatusLabel,
  summarizeApprovalStatus,
} from "@/lib/data/approvals"
import {
  updateOpportunityAction,
  updateOpportunityStageAction,
  createActivityAction,
  updateOpportunitySplitsAction,
  updateOpportunityTeamMembersAction,
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
  const [opportunity, businessUnits, activities, splits, teamMembers, stageHistory, userOptions, approvals] =
    await Promise.all([
      getOpportunityById(ctx, id),
      getBusinessUnitOptions(ctx),
      getActivitiesForOpportunity(ctx, id),
      getOpportunitySplits(ctx, id),
      getOpportunityTeamMembers(ctx, id),
      getStageHistoryForOpportunity(ctx, id),
      getUserOptions(ctx),
      getApprovalHistoryForOpportunity(ctx, id),
    ])

  if (!opportunity) {
    notFound()
  }

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
      updateSplitsAction={updateOpportunitySplitsAction}
      updateTeamAction={updateOpportunityTeamMembersAction}
    />
  )
}
