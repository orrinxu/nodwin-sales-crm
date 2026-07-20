import { notFound } from "next/navigation"
import { requireUser, isSuperAdmin } from "@/lib/security/auth"
import { getBreakGlassTarget } from "@/lib/data/break-glass"
import { BreakGlassGate } from "@/components/opportunities/break-glass-gate"
import {
  getOpportunityById,
  getBusinessUnitOptions,
  getOpportunitySplits,
  getOpportunityTeamMembers,
  getUserOptions,
} from "@/lib/data/opportunities"
import { getStageHistoryForOpportunity } from "@/lib/data/opportunity-stage-history"
import { getAccountOptions } from "@/lib/data/contacts"
import { getFieldDefinitions } from "@/lib/data/field-definitions"
import { getOpportunityLineItemsSummary } from "@/lib/data/opportunity-line-items"
import { getAllProducts } from "@/lib/data/products"
import { getSalesProcessSettings } from "@/lib/data/sales-process-settings"
import { lineItemsRequirementUnmet } from "@/lib/opportunity"
import { getStageLabel } from "@/lib/data/opportunities.types"
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
  createMeetingAction,
  updateOpportunitySplitsAction,
  updateOpportunityTeamMembersAction,
  saveOpportunityLineItemsAction,
  submitOpportunityForApprovalAction,
  recordApprovalDecisionAction,
  reassignApprovalStepAction,
  cancelApprovalInstanceAction,
  searchAccountsAction,
  searchContactsAction,
  searchUsersAction,
  createContactQuickAction,
  createAccountQuickAction,
} from "../actions"
import {
  dealCopilotSummaryAction,
  dealCopilotEmailAction,
  dealCopilotNextBestActionAction,
} from "../copilot-actions"
import { isDealCopilotConfigured } from "@/lib/ai/deal-copilot"
import { OpportunityDetailWrapper } from "@/components/opportunities/opportunity-detail-wrapper"
import { listDocumentsForEntity } from "@/lib/data/documents"
import { getCustomSchedule } from "@/lib/data/revenue-schedule"
import {
  getWorkingCapitalForOpportunity,
  listCashflowMilestones,
} from "@/lib/data/cashflow-milestones"
import { serializeWorkingCapital } from "@/lib/finance/working-capital-dto"
import {
  getRevenueScheduleAction,
  saveRevenueScheduleAction,
  getWorkingCapitalAction,
  listCostMilestonesAction,
  createCostMilestoneAction,
  updateCostMilestoneAction,
  deleteCostMilestoneAction,
} from "../finance-actions"

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
    // Exec break-glass entry (ORR-716): a founder holding a Confidential deal's
    // link but no access yet gets the accountable door instead of a 404. For
    // everyone else — and any non-Confidential / non-existent id — the probe
    // returns nothing and the page falls through to a normal 404.
    const breakGlassTarget = await getBreakGlassTarget(id)
    if (breakGlassTarget) {
      return (
        <BreakGlassGate
          opportunityId={id}
          opportunityName={breakGlassTarget.opportunityName}
          ownerName={breakGlassTarget.ownerName}
        />
      )
    }
    notFound()
  }

  const [businessUnits, activities, splits, teamMembers, stageHistory, userOptions, approvals, approvalActionState, enforceGateStatus, dealCopilotConfigured, documents, revenueScheduleRows, costMilestones, workingCapitalResult, lineItemsSummary, productRecords, salesProcessSettings, accounts, fieldDefinitions] =
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
      isDealCopilotConfigured(),
      listDocumentsForEntity(ctx, { opportunityId: id }),
      getCustomSchedule(id, ctx),
      listCashflowMilestones(id, ctx),
      // Deriving working capital runs on every detail load; a bad deal (e.g. a
      // post-hoc currency change vs. its milestones) must not 500 the whole page.
      // Degrade to null → the P&L tab shows "unavailable", the rest of the page is
      // unaffected.
      getWorkingCapitalForOpportunity(id, ctx).catch((e) => {
        console.error(`Working-capital derivation failed for opportunity ${id}:`, e)
        return null
      }),
      getOpportunityLineItemsSummary(ctx, id),
      getAllProducts(ctx),
      getSalesProcessSettings(ctx),
      getAccountOptions(ctx),
      getFieldDefinitions(ctx, "opportunity"),
    ])

  // ORR-753: warn (not block) when a deal has reached the configured stage
  // without line items and isn't waived by a manual override.
  const lineItemsWarning =
    salesProcessSettings.lineItemsRequiredFromStage &&
    lineItemsRequirementUnmet({
      stage: opportunity.stage,
      hasLineItems: lineItemsSummary.lines.length > 0,
      amountOverridden: lineItemsSummary.overridden,
      config: {
        requiredFromStage: salesProcessSettings.lineItemsRequiredFromStage,
        overrideExempts: salesProcessSettings.lineItemsOverrideExempts,
      },
    })
      ? `Line items are expected from the “${getStageLabel(
          salesProcessSettings.lineItemsRequiredFromStage,
        )}” stage — this deal has none. Add them in the Products tab.`
      : null

  // Active catalog products, mapped to the light shape the line-item picker needs.
  const productOptions = productRecords
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      unitPriceAmount: p.unitPriceAmount,
      unitCostAmount: p.unitCostAmount,
    }))

  const approvalStatus = approvalStatusLabel(summarizeApprovalStatus(approvals))
  const revenueSchedule = revenueScheduleRows.map((r) => ({ month: r.month.slice(0, 10), amount: r.amount }))
  const costMilestonesOut = costMilestones.filter((m) => m.direction === "out")
  const workingCapital = workingCapitalResult
    ? serializeWorkingCapital(workingCapitalResult, opportunity.currency)
    : undefined

  return (
    <OpportunityDetailWrapper
      opportunity={opportunity}
      businessUnits={businessUnits}
      updateAction={updateOpportunityAction}
      updateStageAction={updateOpportunityStageAction}
      activities={activities}
      documents={documents}
      createActivityAction={createActivityAction}
      createMeetingAction={createMeetingAction}
      accounts={accounts}
      fieldDefinitions={fieldDefinitions}
      searchAccountsAction={searchAccountsAction}
      searchContactsAction={searchContactsAction}
      searchUsersAction={searchUsersAction}
      createContactQuickAction={createContactQuickAction}
      createAccountQuickAction={createAccountQuickAction}
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
      lineItemsSummary={lineItemsSummary}
      products={productOptions}
      saveLineItemsAction={saveOpportunityLineItemsAction}
      lineItemsWarning={lineItemsWarning}
      enforceGateStatus={enforceGateStatus}
      dealCopilotConfigured={dealCopilotConfigured}
      dealCopilotSummaryAction={dealCopilotSummaryAction}
      dealCopilotEmailAction={dealCopilotEmailAction}
      dealCopilotNextBestActionAction={dealCopilotNextBestActionAction}
      revenueSchedule={revenueSchedule}
      getRevenueScheduleAction={getRevenueScheduleAction}
      saveRevenueScheduleAction={saveRevenueScheduleAction}
      workingCapital={workingCapital}
      costMilestones={costMilestonesOut}
      getWorkingCapitalAction={getWorkingCapitalAction}
      listCostMilestonesAction={listCostMilestonesAction}
      createCostMilestoneAction={createCostMilestoneAction}
      updateCostMilestoneAction={updateCostMilestoneAction}
      deleteCostMilestoneAction={deleteCostMilestoneAction}
    />
  )
}
