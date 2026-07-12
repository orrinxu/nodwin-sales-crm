"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Pencil, SendHorizontal, Calendar, Mail, TriangleAlert, Plus, ArrowRight, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { OwnerLink } from "@/components/people/owner-link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { FacetTabs, FacetTabsList, FacetTabsTab, FacetTabsPanel } from "@/components/primitives/facet-tabs"
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
import { DealCopilot } from "@/components/opportunities/deal-copilot"
import { FilesModule } from "@/components/documents/files-module"
import { PinnedDocumentSlots } from "@/components/documents/pinned-document-slots"
import { DefinitionField, DefinitionFieldGrid } from "@/components/primitives/definition-grid"
import { RecordHeader } from "@/components/primitives/record-header"
import { StageTracker } from "@/components/opportunities/stage-tracker"
import type { DocumentSummary } from "@/lib/data/documents"
import type { DealCopilotResult } from "@/lib/ai/deal-copilot"
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
import { SERVICE_TYPE_LABELS, PROPERTY_TYPE_LABELS, getStageLabel } from "@/lib/data/opportunities.types"
import { DEAL_STAGES, NON_TERMINAL_STAGES, TERMINAL_STAGES } from "@/lib/opportunity"
import type { DealStage } from "@/lib/opportunity"
import { Money } from "@/lib/money"
import { cn } from "@/lib/utils"
import { usePreferences } from "@/components/providers/preferences-provider"
import { RevenueScheduleEditor } from "@/components/opportunities/revenue-schedule-editor"
import type { RevenueScheduleData, ScheduleMonthDTO } from "@/app/(crm)/opportunities/finance-actions"

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

// P&L tab unlocks once the deal reaches Verbal Agreement (labelled "Cash Plan" in the mock).
const CASH_UNLOCK_STAGE: DealStage = "verbal_agreement"

// "YYYY-MM-01" → "Mon YYYY" for the read-only revenue-schedule table.
function revenueMonthLabel(ym: string): string {
  const [y, m] = ym.split("-")
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

// ── Type scale ────────────────────────────────────────────────────────────────
// Centralized half-px scale from the redesign spec, expressed once as shared
// utility strings (fractional CSS weights mapped to the app's available 500/600/700).
// Kept here rather than a parallel stylesheet so it stays reviewable in one place.
const T = {
  h1: "text-[23px] font-bold leading-[1.15] tracking-[-0.02em]",
  statAmount: "text-[22px] font-bold tracking-[-0.02em] tabular-nums",
  statValue: "text-[15px] font-semibold tracking-[-0.01em]",
  cardHeading: "text-[13.5px] font-semibold tracking-[-0.01em]",
  fieldValue: "text-[13.5px] font-medium leading-[1.6]",
  meta: "text-[12px] font-medium",
  fieldLabel: "text-[11.5px] font-medium text-muted-foreground",
  eyebrow: "text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground",
} as const

// Empty-field policy (gate 1). Flip in ONE place: "add" | "hide" | "dash".
const EMPTY_MODE: "add" | "hide" | "dash" = "add"

interface OpportunityDetailWrapperProps {
  opportunity: OpportunityRecord
  businessUnits: BusinessUnitOption[]
  users?: EntityOption[]
  updateAction: (id: string, input: unknown) => Promise<OpportunityRecord>
  updateStageAction: (id: string, input: unknown) => Promise<OpportunityRecord>
  activities: ActivityRecord[]
  documents: DocumentSummary[]
  createActivityAction: (opportunityId: string, input: unknown) => Promise<ActivityRecord>
  searchUsersAction?: (query: string) => Promise<EntityOption[]>
  splits?: OpportunitySplit[]
  teamMembers?: OpportunityTeamMember[]
  stageHistory?: StageHistoryRecord[]
  userOptions?: UserOption[]
  approvals?: ApprovalInstanceRecord[]
  approvalStatus?: string
  canSubmitApproval?: boolean
  actionableStepId?: string | null
  pendingApprovalInstanceId?: string | null
  canAdminApprovals?: boolean
  submitApprovalAction?: (opportunityId: string) => Promise<void>
  recordDecisionAction?: (opportunityId: string, input: { stepId: string; decision: "approved" | "rejected" | "skipped"; comment?: string }) => Promise<void>
  reassignApprovalAction?: (opportunityId: string, input: { stepId: string; newUserId: string }) => Promise<void>
  cancelApprovalAction?: (opportunityId: string, instanceId: string) => Promise<void>
  updateSplitsAction?: (id: string, input: unknown) => Promise<void>
  updateTeamAction?: (id: string, input: unknown) => Promise<void>
  enforceGateStatus?: EnforceGateStatus
  dealCopilotConfigured?: boolean
  dealCopilotSummaryAction?: (opportunityId: string) => Promise<DealCopilotResult>
  dealCopilotEmailAction?: (opportunityId: string) => Promise<DealCopilotResult>
  dealCopilotNextBestActionAction?: (opportunityId: string) => Promise<DealCopilotResult>
  revenueSchedule?: ScheduleMonthDTO[]
  getRevenueScheduleAction?: (opportunityId: string) => Promise<RevenueScheduleData>
  saveRevenueScheduleAction?: (opportunityId: string, months: ScheduleMonthDTO[]) => Promise<void>
}

// ── Small presentational primitives (module scope; stable identity) ─────────────

function DefinitionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className={T.cardHeading}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <DefinitionFieldGrid>{children}</DefinitionFieldGrid>
      </CardContent>
    </Card>
  )
}

/** Peek card header: a section title with a "jump to full tab" affordance. */
function PeekHeader({ title, cta, onClick }: { title: string; cta: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <CardTitle className={T.cardHeading}>{title}</CardTitle>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {cta} <ArrowRight className="size-3" />
      </button>
    </div>
  )
}

/** Approval status as a tinted pill using existing semantic tokens (no warm palette). */
function ApprovalPill({ status }: { status: string }) {
  const s = status.toLowerCase()
  const tone =
    s.includes("approved")
      ? "bg-primary/10 text-primary"
      : s.includes("reject")
        ? "bg-destructive/10 text-destructive"
        : s.includes("pending")
          ? "bg-warning/10 text-warning"
          : "bg-muted text-muted-foreground"
  return (
    <span className={cn("inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[12px] font-semibold", tone)}>
      {status}
    </span>
  )
}

function RelatedListCard({ title, emptyMessage }: { title: string; emptyMessage: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={T.cardHeading}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      </CardContent>
    </Card>
  )
}

// Honest empty state for a tab whose backing integration isn't built yet
// (Email → Gmail, P&L → milestone schedule). See docs/ROADMAP.md.
function IntegrationTabEmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>
  title?: string
  message: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon className="size-8 text-muted-foreground" />
      {title ? <p className="text-[13.5px] font-semibold">{title}</p> : null}
      <p className="max-w-[280px] text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

/** Segmented control for the Activity timeline filter (All / Notes / Calls / Email / Stage history). */
function ActivitySegments({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { v: string; label: string }[]
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-md px-3 py-1 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            value === o.v ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Segmented stage tracker: equal-width steps, node + connectors, current emphasized.
 *  Keeps click-to-set-stage; respects prefers-reduced-motion. */
export function OpportunityDetailWrapper({
  opportunity,
  businessUnits,
  users,
  updateAction,
  updateStageAction,
  activities,
  documents,
  createActivityAction,
  searchUsersAction,
  splits = [],
  teamMembers = [],
  stageHistory = [],
  userOptions = [],
  approvals = [],
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
  enforceGateStatus = { isBlocked: false },
  dealCopilotConfigured = false,
  dealCopilotSummaryAction,
  dealCopilotEmailAction,
  dealCopilotNextBestActionAction,
  revenueSchedule,
  getRevenueScheduleAction,
  saveRevenueScheduleAction,
}: OpportunityDetailWrapperProps) {
  const router = useRouter()
  const { formatDate } = usePreferences()
  const [updatingStage, setUpdatingStage] = useState(false)
  const [approvalPending, setApprovalPending] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")
  const [activitySeg, setActivitySeg] = useState("all")
  // One shared Edit sheet; empty-field "Add" affordances open it via this ref.
  const editTriggerRef = useRef<HTMLButtonElement>(null)
  const openEdit = useCallback(() => editTriggerRef.current?.click(), [])
  const goTo = useCallback((tab: string) => setActiveTab(tab), [])

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
    async (stepId: string, decision: "approved" | "rejected" | "skipped", comment: string) => {
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
  const cashUnlocked = DEAL_STAGES.indexOf(opportunity.stage as DealStage) >= DEAL_STAGES.indexOf(CASH_UNLOCK_STAGE)

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


  const servicePeriod =
    opportunity.servicePeriodStart || opportunity.servicePeriodEnd
      ? `${formatDate(opportunity.servicePeriodStart, "—")} – ${formatDate(opportunity.servicePeriodEnd, "—")}`
      : null

  const countryValue = opportunity.countryExecution
    ? opportunity.countryExecution.split(",").map((c) => COUNTRY_LABELS[c.trim()] ?? c.trim()).join(", ")
    : null

  const serviceTypeValue =
    opportunity.serviceType && opportunity.serviceType.length > 0
      ? opportunity.serviceType.map((t) => SERVICE_TYPE_LABELS[t as ServiceType] ?? t).join(", ")
      : null
  const propertyTypeValue = opportunity.propertyType
    ? (PROPERTY_TYPE_LABELS[opportunity.propertyType as PropertyType] ?? opportunity.propertyType)
    : null

  const activitySegOptions = [
    { v: "all", label: "All" },
    { v: "notes", label: "Notes" },
    { v: "calls", label: "Calls" },
    { v: "email", label: "Email" },
    { v: "stage", label: "Stage history" },
  ]

  return (
    <div className="relative flex flex-col gap-4 p-6">
      {/* ── Header + hairline stat strip ──────────────────────────────────────── */}
      <RecordHeader
        title={opportunity.name}
        subtitle={`${opportunity.probabilityPct}% probability`}
        actions={
          <>
            <OpportunityForm
              opportunity={opportunity}
              businessUnits={businessUnits}
              users={users}
              createAction={async () => { throw new Error("Not available") }}
              updateAction={updateAction}
              onSuccess={() => router.refresh()}
              searchUsersAction={searchUsersAction}
              trigger={
                <Button ref={editTriggerRef} variant="outline" size="sm">
                  <Pencil className="size-4" />
                  Edit
                </Button>
              }
            />
            {canSubmitApproval ? (
              <Button variant="outline" size="sm" onClick={handleSubmitApproval} disabled={approvalPending}>
                <SendHorizontal className="size-4" />
                {approvalPending ? "Submitting..." : "Submit for Approval"}
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled title={approvalStatus === "Pending" ? "Approval in progress" : "Not available"}>
                <SendHorizontal className="size-4" />
                Submit for Approval
              </Button>
            )}
            {cashUnlocked && getRevenueScheduleAction && saveRevenueScheduleAction ? (
              <RevenueScheduleEditor
                opportunityId={opportunity.id}
                currency={opportunity.currency}
                getAction={getRevenueScheduleAction}
                saveAction={saveRevenueScheduleAction}
                onSaved={() => router.refresh()}
              />
            ) : (
              <Button variant="outline" size="sm" disabled title={cashUnlocked ? "Coming soon" : "Unlocks at Verbal Agreement"}>
                <Calendar className="size-4" />
                Set Revenue Schedule
              </Button>
            )}
          </>
        }
        stats={[
          { label: "Amount", value: formattedAmount, valueClassName: T.statAmount, className: "col-span-2 md:col-span-1" },
          { label: "Account", value: opportunity.accountName ?? "—" },
          { label: "Owner", value: <OwnerLink userId={opportunity.ownerUserId} name={opportunity.ownerName} /> },
          { label: "Service period", value: servicePeriod ?? <span className="text-muted-foreground">Not set</span> },
          { label: "Approval status", value: <ApprovalPill status={approvalStatus} /> },
        ]}
      />

      {/* ── Stage tracker ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="py-4">
          <StageTracker
            stage={opportunity.stage}
            isTerminal={isTerminal}
            currentIndex={currentStageIndex}
            disabled={isTerminal || updatingStage}
            onSelect={handleStageClick}
          />
        </CardContent>
      </Card>

      {enforceGateStatus.isBlocked && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-warning">Approval required to advance past this stage</p>
            <p className="text-xs text-warning">
              This stage requires an approved approval before you can move forward. See the{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-warning/80"
                onClick={() => document.getElementById("approval-history-section")?.scrollIntoView({ behavior: "smooth" })}
              >
                Approval
              </button>{" "}
              card to review or submit.
            </p>
          </div>
        </div>
      )}

      {/* ── Main: tabbed detail (left) + persistent rail (right) ──────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <FacetTabs value={activeTab} onValueChange={(v) => setActiveTab(v as string)}>
            <FacetTabsList>
              <FacetTabsTab value="overview">Overview</FacetTabsTab>
              <FacetTabsTab value="details">Details</FacetTabsTab>
              <FacetTabsTab value="files">Files</FacetTabsTab>
              <FacetTabsTab value="activity">Activity</FacetTabsTab>
              <FacetTabsTab value="team">Team &amp; Splits</FacetTabsTab>
              <FacetTabsTab value="cash" locked={!cashUnlocked}>P&amp;L</FacetTabsTab>
            </FacetTabsList>

            {/* OVERVIEW */}
            <FacetTabsPanel value="overview" className="space-y-4">
              <PinnedDocumentSlots
                documents={documents}
                categories={["rfp", "proposal", "contract"]}
                visibilityTier={opportunity.visibilityTier}
              />

              <Card>
                <CardHeader className="pb-0">
                  <PeekHeader title="Key details" cta="View all details" onClick={() => goTo("details")} />
                </CardHeader>
                <CardContent>
                  <DefinitionFieldGrid>
                    <DefinitionField label="Currency" value={opportunity.currency} />
                    <DefinitionField label="Close date" onAdd={openEdit}>
                      {opportunity.closeDate ? formatDate(opportunity.closeDate, "—") : undefined}
                    </DefinitionField>
                    <DefinitionField label="Service type" onAdd={openEdit}>{serviceTypeValue ?? undefined}</DefinitionField>
                    <DefinitionField label="Recurring" value={opportunity.recurring ? "Yes" : "No"} />
                  </DefinitionFieldGrid>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-0">
                  <PeekHeader title="Recent activity" cta="Open Activity" onClick={() => goTo("activity")} />
                </CardHeader>
                <CardContent>
                  {activities.length > 0 ? (
                    <ActivityTimeline activities={activities.slice(0, 3)} />
                  ) : (
                    <p className="py-2 text-xs text-muted-foreground">No activity yet. Log a note or call from the Activity tab.</p>
                  )}
                </CardContent>
              </Card>
            </FacetTabsPanel>

            {/* DETAILS */}
            <FacetTabsPanel value="details" className="space-y-4">
              <DefinitionCard title="Deal details">
                <DefinitionField label="Contact" onAdd={openEdit}>{opportunity.primaryContactName ?? undefined}</DefinitionField>
                <DefinitionField label="Close date" onAdd={openEdit}>
                  {opportunity.closeDate ? formatDate(opportunity.closeDate, "—") : undefined}
                </DefinitionField>
                <DefinitionField label="Loss reason" value={opportunity.lossReason} onAdd={openEdit} />
                <DefinitionField label="Country of execution" onAdd={openEdit}>{countryValue ?? undefined}</DefinitionField>
              </DefinitionCard>

              <DefinitionCard title="Commercials">
                <DefinitionField label="Currency" value={opportunity.currency} />
                <DefinitionField label="Est. gross margin" onAdd={openEdit}>
                  {opportunity.estimatedGrossMarginPct != null ? `${opportunity.estimatedGrossMarginPct}%` : undefined}
                </DefinitionField>
                <DefinitionField label="Barter value" onAdd={openEdit}>{formattedBarter ?? undefined}</DefinitionField>
                <DefinitionField label="Recurring" value={opportunity.recurring ? "Yes" : "No"} />
              </DefinitionCard>

              <DefinitionCard title="Classification">
                <DefinitionField label="Service type" onAdd={openEdit}>{serviceTypeValue ?? undefined}</DefinitionField>
                <DefinitionField label="Property type" onAdd={openEdit}>{propertyTypeValue ?? undefined}</DefinitionField>
                <DefinitionField label="Billing entity" onAdd={openEdit}>{opportunity.billingEntityName ?? undefined}</DefinitionField>
                <DefinitionField label="Entity sales" onAdd={openEdit}>{opportunity.entitySalesName ?? undefined}</DefinitionField>
              </DefinitionCard>

              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className={T.cardHeading}>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  {opportunity.description ? (
                    <p className="whitespace-pre-wrap text-[13.5px] leading-[1.6] text-foreground/90">{opportunity.description}</p>
                  ) : EMPTY_MODE === "add" ? (
                    <button type="button" onClick={openEdit} className="inline-flex items-center gap-1 rounded text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                      <Plus className="size-3" /> Add a description
                    </button>
                  ) : (
                    <p className="text-[13.5px] text-muted-foreground">No description provided.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <Collapsible defaultOpen={false}>
                  <CollapsibleTrigger className="px-4 py-3">
                    <span className={T.cardHeading}>System information</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      <Separator className="mb-4" />
                      <DefinitionFieldGrid>
                        <DefinitionField label="Created" value={formatDate(opportunity.createdAt, "—")} />
                        <DefinitionField label="Last modified" value={formatDate(opportunity.updatedAt, "—")} />
                      </DefinitionFieldGrid>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            </FacetTabsPanel>

            {/* FILES */}
            <FacetTabsPanel value="files">
              <FilesModule opportunityId={opportunity.id} initialDocuments={documents} />
            </FacetTabsPanel>

            {/* ACTIVITY */}
            <FacetTabsPanel value="activity" className="space-y-4">
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className={T.cardHeading}>Log activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ActivityComposer
                    revalidateId={opportunity.id}
                    scope={{ opportunityId: opportunity.id, accountId: opportunity.accountId }}
                    createAction={createActivityAction}
                    onCreated={() => router.refresh()}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 pt-4">
                  <ActivitySegments value={activitySeg} onChange={setActivitySeg} options={activitySegOptions} />

                  {activitySeg === "all" && <ActivityTimeline activities={activities} />}

                  {activitySeg === "notes" && (
                    noteActivities.length > 0 ? (
                      <ActivityTimeline activities={noteActivities} />
                    ) : (
                      <p className="py-6 text-center text-xs text-muted-foreground">No notes yet. Add one above.</p>
                    )
                  )}

                  {activitySeg === "calls" && (
                    callActivities.length > 0 ? (
                      <ActivityTimeline activities={callActivities} />
                    ) : (
                      <p className="py-6 text-center text-xs text-muted-foreground">No calls logged yet. Log one above.</p>
                    )
                  )}

                  {activitySeg === "email" && (
                    <IntegrationTabEmptyState icon={Mail} message="Connect Gmail to send and log email from the CRM." />
                  )}

                  {activitySeg === "stage" && (
                    stageHistory.length > 0 ? (
                      <StageHistoryTimeline history={stageHistory} />
                    ) : (
                      <p className="py-6 text-center text-xs text-muted-foreground">No stage changes recorded yet.</p>
                    )
                  )}
                </CardContent>
              </Card>
            </FacetTabsPanel>

            {/* TEAM & SPLITS */}
            <FacetTabsPanel value="team" className="space-y-4">
              {updateTeamAction ? (
                <Card>
                  <CardHeader>
                    <CardTitle className={T.cardHeading}>Opportunity Team</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <OpportunityTeamEditor members={teamMembers} users={userOptions} onSave={handleSaveTeam} />
                  </CardContent>
                </Card>
              ) : (
                <RelatedListCard title="Opportunity Team" emptyMessage="No team members assigned." />
              )}

              {updateSplitsAction ? (
                <Card>
                  <CardHeader>
                    <CardTitle className={T.cardHeading}>Opportunity Splits</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <OpportunitySplitsEditor splits={splits} businessUnits={businessUnits} users={userOptions} onSave={handleSaveSplits} />
                  </CardContent>
                </Card>
              ) : (
                <RelatedListCard title="Opportunity Splits" emptyMessage="No splits configured." />
              )}
            </FacetTabsPanel>

            {/* CASH PLAN (gated) */}
            <FacetTabsPanel value="cash">
              <Card>
                <CardContent className="pt-6">
                  {cashUnlocked ? (
                    revenueSchedule && revenueSchedule.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className={T.cardHeading}>Revenue schedule</h3>
                          <span className="text-xs text-muted-foreground">Full P&amp;L summary &amp; cost milestones coming next.</span>
                        </div>
                        <div className="overflow-hidden rounded-lg border">
                          <table className="w-full text-sm">
                            <tbody>
                              {revenueSchedule.map((m) => (
                                <tr key={m.month} className="border-t first:border-t-0">
                                  <td className="px-3 py-2 text-muted-foreground">{revenueMonthLabel(m.month)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{opportunity.currency} {m.amount}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <IntegrationTabEmptyState
                        icon={Calendar}
                        title="No revenue schedule yet"
                        message="Use the “Set Revenue Schedule” action above to spread this deal’s amount across its service months. The full P&L summary and cost milestones are coming next."
                      />
                    )
                  ) : (
                    <IntegrationTabEmptyState
                      icon={Lock}
                      title="P&L unlocks at Verbal Agreement"
                      message={`Once the deal reaches Verbal Agreement, this tab becomes the P&L summary, editable milestone schedule and approval routing. The deal is currently at ${getStageLabel(opportunity.stage as DealStage)}.`}
                    />
                  )}
                </CardContent>
              </Card>
            </FacetTabsPanel>
          </FacetTabs>
        </div>

        {/* Persistent rail — Approval + Deal Copilot only. */}
        <div className="w-full shrink-0 space-y-4 lg:sticky lg:top-6 lg:w-[372px]">
          <div id="approval-history-section">
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
          </div>

          {dealCopilotSummaryAction && dealCopilotEmailAction && dealCopilotNextBestActionAction && (
            <DealCopilot
              opportunityId={opportunity.id}
              configured={dealCopilotConfigured}
              summaryAction={dealCopilotSummaryAction}
              emailAction={dealCopilotEmailAction}
              nextBestActionAction={dealCopilotNextBestActionAction}
            />
          )}
        </div>
      </div>
    </div>
  )
}
