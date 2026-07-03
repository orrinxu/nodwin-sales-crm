"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Pencil, SendHorizontal, Calendar, GitBranch, FolderOpen, Mail, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import { OpportunityForm } from "@/components/opportunities/opportunity-form"
import { ActivityTimeline } from "@/components/opportunities/activity-timeline"
import { ActivityComposer } from "@/components/opportunities/activity-composer"
import { OpportunitySplitsEditor } from "@/components/opportunities/opportunity-splits-editor"
import { OpportunityTeamEditor } from "@/components/opportunities/opportunity-team-editor"
import { StageHistoryTimeline } from "@/components/opportunities/stage-history-timeline"
import { ApprovalCard } from "@/components/opportunities/approval-card"
import type { EntityOption } from "@/components/entity-combobox"
import type {
  OpportunityRecord,
  BusinessUnitOption,
  ServiceType,
  PropertyType,
  OpportunitySplit,
  OpportunitySplitInput,
  OpportunityTeamMember,
  OpportunityTeamMemberInput,
  UserOption,
} from "@/lib/data/opportunities.types"
import type { StageHistoryRecord } from "@/lib/data/opportunity-stage-history"
import type { ActivityRecord } from "@/lib/data/activities"
import type { ApprovalInstanceRecord, EnforceGateStatus } from "@/lib/data/approvals"
import { getStageLabel, SERVICE_TYPE_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/data/opportunities.types"
import { NON_TERMINAL_STAGES, TERMINAL_STAGES } from "@/lib/opportunity"
import type { DealStage } from "@/lib/opportunity"
import { Money } from "@/lib/money"

const COUNTRY_LABELS: Record<string, string> = {
  AE: "United Arab Emirates", AR: "Argentina", AU: "Australia", BD: "Bangladesh",
  BR: "Brazil", CA: "Canada", CN: "China", DE: "Germany", EG: "Egypt",
  ES: "Spain", FR: "France", GB: "United Kingdom", ID: "Indonesia",
  IN: "India", IT: "Italy", JP: "Japan", KR: "South Korea", MX: "Mexico",
  MY: "Malaysia", NG: "Nigeria", NL: "Netherlands", PH: "Philippines",
  PK: "Pakistan", PL: "Poland", QA: "Qatar", RU: "Russia", SA: "Saudi Arabia",
  SG: "Singapore", TH: "Thailand", TR: "Turkey", US: "United States",
  VN: "Vietnam", ZA: "South Africa",
}

interface OpportunityDetailWrapperProps {
  opportunity: OpportunityRecord
  businessUnits: BusinessUnitOption[]
  users?: EntityOption[]
  updateAction: (id: string, input: unknown) => Promise<OpportunityRecord>
  updateStageAction: (id: string, input: unknown) => Promise<OpportunityRecord>
  activities: ActivityRecord[]
  createActivityAction: (opportunityId: string, input: unknown) => Promise<ActivityRecord>
  searchUsersAction?: (query: string) => Promise<EntityOption[]>
  splits?: OpportunitySplit[]
  teamMembers?: OpportunityTeamMember[]
  stageHistory?: StageHistoryRecord[]
  userOptions?: UserOption[]
  approvals?: ApprovalInstanceRecord[]
  enforceGateStatus?: EnforceGateStatus
  approvalStatus?: string
  canSubmitApproval?: boolean
  actionableStepId?: string | null
  pendingApprovalInstanceId?: string | null
  canAdminApprovals?: boolean
  submitApprovalAction?: (opportunityId: string) => Promise<void>
  recordDecisionAction?: (opportunityId: string, input: { stepId: string; decision: "approved" | "rejected"; comment?: string }) => Promise<void>
  reassignApprovalAction?: (opportunityId: string, input: { stepId: string; newUserId: string }) => Promise<void>
  cancelApprovalAction?: (opportunityId: string, instanceId: string) => Promise<void>
  updateSplitsAction?: (id: string, input: unknown) => Promise<void>
  updateTeamAction?: (id: string, input: unknown) => Promise<void>
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014"
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function Field({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  )
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="px-4 py-3">
        <span className="text-sm font-semibold">{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4">
          <Separator className="mb-4" />
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function RelatedListCard({ title, emptyMessage }: { title: string; emptyMessage: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      </CardContent>
    </Card>
  )
}

// Honest empty state for a tab whose backing integration isn't built yet
// (Files → Google Drive, Email → Gmail). See docs/ROADMAP.md.
function IntegrationTabEmptyState({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>
  message: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <p className="max-w-[220px] text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

export function OpportunityDetailWrapper({
  opportunity,
  businessUnits,
  users,
  updateAction,
  updateStageAction,
  activities,
  createActivityAction,
  searchUsersAction,
  splits = [],
  teamMembers = [],
  stageHistory = [],
  userOptions = [],
  approvals = [],
  enforceGateStatus,
  approvalStatus = "Not submitted",
  canSubmitApproval = false,
  actionableStepId = null,
  pendingApprovalInstanceId = null,
  canAdminApprovals = false,
  submitApprovalAction,
  recordDecisionAction,
  reassignApprovalAction,
  cancelApprovalAction,
  updateSplitsAction,
  updateTeamAction,
}: OpportunityDetailWrapperProps) {
  const router = useRouter()
  const [updatingStage, setUpdatingStage] = useState(false)
  const [approvalPending, setApprovalPending] = useState(false)

  const handleSubmitApproval = useCallback(async () => {
    if (!submitApprovalAction) return
    setApprovalPending(true)
    try {
      await submitApprovalAction(opportunity.id)
      router.refresh()
    } finally {
      setApprovalPending(false)
    }
  }, [submitApprovalAction, opportunity.id, router])

  const handleDecision = useCallback(
    async (stepId: string, decision: "approved" | "rejected", comment: string) => {
      if (!recordDecisionAction) return
      setApprovalPending(true)
      try {
        await recordDecisionAction(opportunity.id, { stepId, decision, comment: comment || undefined })
        router.refresh()
      } finally {
        setApprovalPending(false)
      }
    },
    [recordDecisionAction, opportunity.id, router],
  )

  const handleReassign = useCallback(
    async (stepId: string, userId: string) => {
      if (!reassignApprovalAction) return
      setApprovalPending(true)
      try {
        await reassignApprovalAction(opportunity.id, { stepId, newUserId: userId })
        router.refresh()
      } finally {
        setApprovalPending(false)
      }
    },
    [reassignApprovalAction, opportunity.id, router],
  )

  const handleCancel = useCallback(
    async (instanceId: string) => {
      if (!cancelApprovalAction) return
      setApprovalPending(true)
      try {
        await cancelApprovalAction(opportunity.id, instanceId)
        router.refresh()
      } finally {
        setApprovalPending(false)
      }
    },
    [cancelApprovalAction, opportunity.id, router],
  )

  const noteActivities = activities.filter((a) => a.type === "note")
  const callActivities = activities.filter((a) => a.type === "call")

  const handleSaveSplits = useCallback(
    async (next: OpportunitySplitInput[]) => {
      if (!updateSplitsAction) return
      await updateSplitsAction(opportunity.id, { splits: next })
      router.refresh()
    },
    [updateSplitsAction, opportunity.id, router],
  )

  const handleSaveTeam = useCallback(
    async (next: OpportunityTeamMemberInput[]) => {
      if (!updateTeamAction) return
      await updateTeamAction(opportunity.id, { members: next })
      router.refresh()
    },
    [updateTeamAction, opportunity.id, router],
  )

  const formattedAmount = Money.fromAmount(opportunity.amount, opportunity.currency).toDisplay()
  const formattedBarter = opportunity.barterValue
    ? Money.fromAmount(opportunity.barterValue, opportunity.currency).toDisplay()
    : null

  const isTerminal = (TERMINAL_STAGES as readonly string[]).includes(opportunity.stage)
  const currentStageIndex = isTerminal ? -1 : NON_TERMINAL_STAGES.indexOf(opportunity.stage)

  const handleStageClick = useCallback(async (stage: DealStage) => {
    if (updatingStage) return
    setUpdatingStage(true)
    try {
      await updateStageAction(opportunity.id, { stage })
      router.refresh()
    } catch (err) {
      console.error("Failed to update stage:", err instanceof Error ? err.message : err)
    } finally {
      setUpdatingStage(false)
    }
  }, [opportunity.id, updateStageAction, router, updatingStage])

  const entityName = (id: string | null) => {
    if (!id) return "\u2014"
    return businessUnits.find((e) => e.id === id)?.name ?? id
  }

  return (
    <div className="relative p-6">
      {/* ── Header / Page Actions ────────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight truncate">
            {opportunity.name}
          </h1>
          <div className="mt-1 flex items-center gap-3">
            {isTerminal ? (
              <Badge variant={opportunity.stage === "closed_won" ? "default" : "destructive"}>
                {getStageLabel(opportunity.stage)}
              </Badge>
            ) : (
              <Badge variant="secondary">{getStageLabel(opportunity.stage)}</Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {opportunity.probabilityPct}%
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <OpportunityForm
            opportunity={opportunity}
            businessUnits={businessUnits}
            users={users}
            createAction={async () => { throw new Error("Not available") }}
            updateAction={updateAction}
            onSuccess={() => router.refresh()}
            searchUsersAction={searchUsersAction}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="size-4" />
                Edit
              </Button>
            }
          />
          {canSubmitApproval ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSubmitApproval}
              disabled={approvalPending}
            >
              <SendHorizontal className="size-4" />
              {approvalPending ? "Submitting..." : "Submit for Approval"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled
              title={approvalStatus === "Pending" ? "Approval in progress" : "Not available"}
            >
              <SendHorizontal className="size-4" />
              Submit for Approval
            </Button>
          )}
          <Button variant="outline" size="sm" disabled title="Coming soon">
            <Calendar className="size-4" />
            Set Revenue Schedule
          </Button>
          <Button variant="outline" size="sm" disabled title="Coming soon">
            <GitBranch className="size-4" />
            Create Jira Issue
          </Button>
        </div>
      </div>

      {/* ── Highlights Bar ───────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardContent className="py-3">
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <Field label="Account" value={opportunity.accountName ?? "\u2014"} />
            <Field label="Amount" value={formattedAmount} />
            <Field label="Service Period" value={`${formatDate(opportunity.servicePeriodStart)} \u2013 ${formatDate(opportunity.servicePeriodEnd)}`} />
            <Field label="Owner" value={opportunity.ownerName ?? "Unassigned"} />
            <Field label="Approval Status" value={approvalStatus} />
          </dl>
        </CardContent>
      </Card>

      {/* ── Enforce Gate Banner ──────────────────────────────────────────────── */}
      {enforceGateStatus?.isBlocked && !isTerminal && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Approval required before advancing
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {enforceGateStatus.blockingWorkflows.length === 1
                  ? `The "${enforceGateStatus.blockingWorkflows[0].name}" workflow must be approved before this opportunity can move past the current stage.`
                  : `The following approval workflows must be approved before this opportunity can move past the current stage: ${enforceGateStatus.blockingWorkflows.map((w) => `"${w.name}"`).join(", ")}.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Stage Path ───────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-0">
              {NON_TERMINAL_STAGES.map((s) => {
                const stageIdx = NON_TERMINAL_STAGES.indexOf(s)
                const isActive = !isTerminal && stageIdx <= currentStageIndex
                const isCurrent = opportunity.stage === s
                return (
                  <div key={s} className="flex items-center">
                    <button
                      type="button"
                      disabled={isTerminal || updatingStage}
                      onClick={() => handleStageClick(s)}
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors
                        ${isCurrent ? "bg-primary text-primary-foreground" : ""}
                        ${isActive && !isCurrent ? "text-primary" : ""}
                        ${!isActive && !isCurrent ? "text-muted-foreground" : ""}
                        ${!isTerminal && !isCurrent ? "hover:bg-muted cursor-pointer" : "cursor-default"}
                      `}
                    >
                      {getStageLabel(s)}
                    </button>
                    <div className={`mx-1 h-px w-6 ${isActive ? "bg-primary" : "bg-muted-foreground/20"}`} />
                  </div>
                )
              })}
              <span
                className={`rounded-md px-2 py-1 text-xs font-medium
                  ${isTerminal ? "bg-primary text-primary-foreground" : "text-muted-foreground"}
                `}
              >
                Closed
              </span>
            </div>
            {!isTerminal && (
              <span className="text-[11px] text-muted-foreground shrink-0">
                Click a stage to mark as current
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Main Content: Left + Right Columns ───────────────────────────────── */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left Panel */}
        <div className="min-w-0 flex-1 space-y-2">
          <Card>
            {/* ── Details Section ────────────────────────────────────────────── */}
            <CollapsibleSection title="Details">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Name" value={opportunity.name} />
                <Field label="Account Name" value={opportunity.accountName ?? "\u2014"} />
                <Field label="Contact" value={opportunity.primaryContactId ?? "\u2014"} />
                <Field label="Stage" value={getStageLabel(opportunity.stage)} />
                <Field label="Probability (%)" value={`${opportunity.probabilityPct}%`} />
                <Field label="Service Period Start" value={formatDate(opportunity.servicePeriodStart)} />
                <Field label="Service Period End" value={formatDate(opportunity.servicePeriodEnd)} />
                <Field label="Close Date" value={formatDate(opportunity.closeDate)} />
                <Field label="Loss Reason" value={opportunity.lossReason ?? "\u2014"} />
                <Field label="Opportunity Owner" value={opportunity.ownerName ?? "Unassigned"} />
              </dl>
            </CollapsibleSection>

            <Separator />

            {/* ── Description Section ────────────────────────────────────────── */}
            <CollapsibleSection title="Description">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {opportunity.description ?? "No description provided."}
              </p>
            </CollapsibleSection>

            <Separator />

            {/* ── Pricing Section ────────────────────────────────────────────── */}
            <CollapsibleSection title="Pricing">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Amount" value={formattedAmount} />
                <Field label="Currency" value={opportunity.currency} />
                <Field label="Est. Gross Margin (%)" value={opportunity.estimatedGrossMarginPct != null ? `${opportunity.estimatedGrossMarginPct}%` : "\u2014"} />
                <Field label="Country Execution" value={opportunity.countryExecution
                  ? opportunity.countryExecution.split(",").map((c) => COUNTRY_LABELS[c.trim()] ?? c.trim()).join(", ")
                  : "\u2014"} />
                <Field label="Billing Entity" value={entityName(opportunity.billingEntityId)} />
                <Field label="Entity Sales" value={entityName(opportunity.entitySalesId)} />
                <Field label="Barter Value" value={formattedBarter ?? "\u2014"} />
              </dl>
            </CollapsibleSection>

            <Separator />

            {/* ── Other Information Section ──────────────────────────────────── */}
            <CollapsibleSection title="Other Information">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field
                  label="Service Type"
                  value={
                    opportunity.serviceType && opportunity.serviceType.length > 0
                      // eslint-disable-next-line security/detect-object-injection
                      ? opportunity.serviceType.map((t) => SERVICE_TYPE_LABELS[t as ServiceType] ?? t).join(", ")
                      : "\u2014"
                  }
                />
                <Field
                  label="Property Type"
                  value={
                    opportunity.propertyType
                      ? (PROPERTY_TYPE_LABELS[opportunity.propertyType as PropertyType] ?? opportunity.propertyType)
                      : "\u2014"
                  }
                />
              </dl>
            </CollapsibleSection>

            <Separator />

            {/* ── System Information Section ─────────────────────────────────── */}
            <CollapsibleSection title="System Information" defaultOpen={false}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Approval Status" value={approvalStatus} />
                <Field label="Last Stage Change" value="\u2014" />
                <Field label="Last Stage Change Date" value="\u2014" />
                <Field label="Created By" value={formatDate(opportunity.createdAt)} />
                <Field label="Created At" value={formatDate(opportunity.createdAt)} />
                <Field label="Last Modified By" value={formatDate(opportunity.updatedAt)} />
                <Field label="Last Modified At" value={formatDate(opportunity.updatedAt)} />
              </dl>
            </CollapsibleSection>
          </Card>
        </div>

        {/* Right Panel */}
        <div className="w-full shrink-0 space-y-4 lg:w-80">
          {/* Communications: Notes / Activity / Call / Email / Files tabs */}
          <Card>
            <CardContent className="pt-4">
              <Tabs defaultValue="activity">
                <TabsList className="w-full justify-start overflow-x-auto">
                  <TabsTab value="activity">Activity</TabsTab>
                  <TabsTab value="notes">Notes</TabsTab>
                  <TabsTab value="calls">Calls</TabsTab>
                  <TabsTab value="files">Files</TabsTab>
                  <TabsTab value="email">Email</TabsTab>
                </TabsList>

                <TabsPanel value="activity" className="space-y-3">
                  <ActivityComposer
                    revalidateId={opportunity.id}
                    scope={{ opportunityId: opportunity.id, accountId: opportunity.accountId }}
                    createAction={createActivityAction}
                    onCreated={() => router.refresh()}
                  />
                  <ActivityTimeline activities={activities} />
                </TabsPanel>

                <TabsPanel value="notes">
                  {noteActivities.length > 0 ? (
                    <ActivityTimeline activities={noteActivities} />
                  ) : (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      No notes yet. Add one from the Activity tab.
                    </p>
                  )}
                </TabsPanel>

                <TabsPanel value="calls">
                  {callActivities.length > 0 ? (
                    <ActivityTimeline activities={callActivities} />
                  ) : (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      No calls logged yet. Log one from the Activity tab.
                    </p>
                  )}
                </TabsPanel>

                <TabsPanel value="files">
                  <IntegrationTabEmptyState
                    icon={FolderOpen}
                    message="Connect Google Drive to attach and view files on this opportunity."
                  />
                </TabsPanel>

                <TabsPanel value="email">
                  <IntegrationTabEmptyState
                    icon={Mail}
                    message="Connect Gmail to send and log email from the CRM."
                  />
                </TabsPanel>
              </Tabs>
            </CardContent>
          </Card>

          <ApprovalCard
            approvals={approvals}
            approvalStatus={approvalStatus}
            actionableStepId={actionableStepId}
            pendingInstanceId={pendingApprovalInstanceId}
            canAdmin={canAdminApprovals}
            userOptions={userOptions}
            pending={approvalPending}
            onDecide={handleDecision}
            onReassign={handleReassign}
            onCancel={handleCancel}
          />

          {updateTeamAction ? (
            <OpportunityTeamEditor
              members={teamMembers}
              users={userOptions}
              onSave={handleSaveTeam}
            />
          ) : (
            <RelatedListCard title="Opportunity Team" emptyMessage="No team members assigned." />
          )}

          {updateSplitsAction ? (
            <OpportunitySplitsEditor
              splits={splits}
              businessUnits={businessUnits}
              users={userOptions}
              onSave={handleSaveSplits}
            />
          ) : (
            <RelatedListCard title="Opportunity Splits" emptyMessage="No splits configured." />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Stage History</CardTitle>
            </CardHeader>
            <CardContent>
              {stageHistory.length > 0 ? (
                <StageHistoryTimeline history={stageHistory} />
              ) : (
                <p className="text-xs text-muted-foreground">No stage changes recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
