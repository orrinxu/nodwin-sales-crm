"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Pencil, SendHorizontal, Calendar, Mail, TriangleAlert, Check, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { DealCopilot } from "@/components/opportunities/deal-copilot"
import { FilesModule } from "@/components/documents/files-module"
import { PinnedDocumentSlots } from "@/components/documents/pinned-document-slots"
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
import { getStageLabel, SERVICE_TYPE_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/data/opportunities.types"
import { NON_TERMINAL_STAGES, TERMINAL_STAGES } from "@/lib/opportunity"
import type { DealStage } from "@/lib/opportunity"
import { Money } from "@/lib/money"
import { cn } from "@/lib/utils"

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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function isEmpty(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0)
}

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
}

// ── Small presentational primitives (module scope; stable identity) ─────────────

/** One cell of the hairline stat strip: eyebrow label + value + optional sub-line. */
function StatCell({
  label,
  value,
  sub,
  valueClassName,
  className,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  valueClassName?: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1 bg-card px-4 py-3", className)}>
      <span className={T.eyebrow}>{label}</span>
      <span className={cn(T.statValue, valueClassName)}>{value}</span>
      {sub ? <span className="text-[11.5px] text-muted-foreground">{sub}</span> : null}
    </div>
  )
}

/** A definition-grid field: label over value, hairline row, muted "Add" when empty. */
function DField({
  label,
  value,
  children,
  onAdd,
}: {
  label: string
  value?: unknown
  children?: React.ReactNode
  onAdd?: () => void
}) {
  const empty = children === undefined ? isEmpty(value) : isEmpty(children)
  if (empty && EMPTY_MODE === "hide") return null
  return (
    <div className="flex flex-col gap-[3px] border-b border-border py-[11px] last:border-b-0">
      <dt className={T.fieldLabel}>{label}</dt>
      <dd>
        {empty ? (
          EMPTY_MODE === "add" && onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1 rounded text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <Plus className="size-3" /> Add
            </button>
          ) : (
            <span className="text-[13.5px] text-muted-foreground">{"—"}</span>
          )
        ) : (
          <span className={T.fieldValue}>{children ?? (value as React.ReactNode)}</span>
        )}
      </dd>
    </div>
  )
}

function DefinitionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className={T.cardHeading}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">{children}</dl>
      </CardContent>
    </Card>
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
          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
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

/** Segmented stage tracker: equal-width steps, node + connectors, current emphasized.
 *  Keeps click-to-set-stage; respects prefers-reduced-motion. */
function StageTracker({
  stage,
  isTerminal,
  currentIndex,
  disabled,
  onSelect,
}: {
  stage: DealStage
  isTerminal: boolean
  currentIndex: number
  disabled: boolean
  onSelect: (s: DealStage) => void
}) {
  const closedWon = stage === "closed_won"
  return (
    <div className="flex items-stretch overflow-x-auto">
      {NON_TERMINAL_STAGES.map((s, i) => {
        const completed = !isTerminal && i < currentIndex
        const current = !isTerminal && stage === s
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            aria-current={current ? "step" : undefined}
            title={disabled ? undefined : `Set stage to ${getStageLabel(s)}`}
            onClick={() => onSelect(s)}
            className={cn(
              "group flex min-w-[72px] flex-1 flex-col items-center gap-1.5 rounded-md py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
              disabled ? "cursor-default" : "cursor-pointer hover:bg-muted/60",
            )}
          >
            <div className="flex w-full items-center">
              <span className={cn("h-[3px] flex-1 transition-colors motion-reduce:transition-none", i === 0 ? "invisible" : completed || current ? "bg-primary" : "bg-border")} />
              <span
                className={cn(
                  "relative z-10 flex size-5 items-center justify-center rounded-full text-[10px] transition-colors motion-reduce:transition-none",
                  completed && "bg-primary text-primary-foreground",
                  current && "border border-primary bg-background ring-4 ring-primary/20",
                  !completed && !current && "border border-border bg-background",
                )}
              >
                {completed ? <Check className="size-3" /> : current ? <span className="size-1.5 rounded-full bg-primary" /> : null}
              </span>
              <span className={cn("h-[3px] flex-1 transition-colors motion-reduce:transition-none", completed ? "bg-primary" : "bg-border")} />
            </div>
            <span className={cn("px-1 text-center text-[12px]", current ? "font-semibold text-primary" : completed ? "text-foreground" : "text-muted-foreground")}>
              {getStageLabel(s)}
            </span>
          </button>
        )
      })}
      {/* Closed terminal segment */}
      <div className="flex min-w-[72px] flex-1 flex-col items-center gap-1.5 py-1">
        <div className="flex w-full items-center">
          <span className={cn("h-[3px] flex-1", isTerminal ? "bg-primary" : "bg-border")} />
          <span
            className={cn(
              "relative z-10 flex size-5 items-center justify-center rounded-full",
              isTerminal ? (closedWon ? "bg-primary text-primary-foreground" : "bg-destructive text-white") : "border border-border bg-background",
            )}
          >
            {isTerminal ? <Check className="size-3" /> : null}
          </span>
          <span className="h-[3px] flex-1 invisible" />
        </div>
        <span className={cn("text-[12px]", isTerminal ? (closedWon ? "font-semibold text-primary" : "font-semibold text-destructive") : "text-muted-foreground")}>
          {isTerminal ? getStageLabel(stage) : "Closed"}
        </span>
      </div>
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
}: OpportunityDetailWrapperProps) {
  const router = useRouter()
  const [updatingStage, setUpdatingStage] = useState(false)
  const [approvalPending, setApprovalPending] = useState(false)
  // One shared Edit sheet; empty-field "Add" affordances open it via this ref.
  const editTriggerRef = useRef<HTMLButtonElement>(null)
  const openEdit = useCallback(() => editTriggerRef.current?.click(), [])

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
      ? `${formatDate(opportunity.servicePeriodStart)} – ${formatDate(opportunity.servicePeriodEnd)}`
      : null

  // Billing entity / entity-sales: only the raw id is available (billing_entity_id
  // → entities, but this component is only handed business_units). Render a muted
  // id hint; entity-name resolution is a separate data-layer ticket (ORR gate 2).
  const entityHint = (id: string | null) =>
    id ? <span className="text-muted-foreground" title={id}>{`Entity · ${id.slice(0, 8)}…`}</span> : undefined

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

  return (
    <div className="relative flex flex-col gap-4 p-6">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className={cn(T.h1, "truncate")}>{opportunity.name}</h1>
          <p className={cn(T.meta, "mt-1 text-muted-foreground")}>
            {opportunity.probabilityPct}% probability
          </p>
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
          <Button variant="outline" size="sm" disabled title="Coming soon">
            <Calendar className="size-4" />
            Set Revenue Schedule
          </Button>
        </div>
      </div>

      {/* ── Hairline stat strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        {/* Amount spans both mobile columns so the 5 cells tile evenly (no stray
            border-colored slot on a 2-col mobile grid). */}
        <StatCell label="Amount" value={formattedAmount} valueClassName={T.statAmount} className="col-span-2 md:col-span-1" />
        <StatCell label="Account" value={opportunity.accountName ?? "—"} />
        <StatCell label="Owner" value={opportunity.ownerName ?? "Unassigned"} />
        <StatCell label="Service period" value={servicePeriod ?? <span className="text-muted-foreground">Not set</span>} />
        <StatCell label="Approval status" value={<ApprovalPill status={approvalStatus} />} />
      </div>

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
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Approval required to advance past this stage</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              This stage requires an approved approval before you can move forward. See the{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100"
                onClick={() => document.getElementById("approval-history-section")?.scrollIntoView({ behavior: "smooth" })}
              >
                Approval
              </button>{" "}
              card to review or submit.
            </p>
          </div>
        </div>
      )}

      {/* ── Main: left detail cards + right rail ──────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          {/* Documents band — always visible, directly under the stage bar and
              above the deal fields. Deviates from T-059 (docs as a tab) on
              purpose: deals here are document-centric. See CHANGELOG. */}
          <PinnedDocumentSlots
            documents={documents}
            categories={["rfp", "proposal", "contract"]}
            visibilityTier={opportunity.visibilityTier}
          />
          <FilesModule opportunityId={opportunity.id} initialDocuments={documents} />

          <DefinitionCard title="Deal details">
            <DField label="Contact" value={opportunity.primaryContactId} onAdd={openEdit} />
            <DField label="Close date" onAdd={openEdit}>
              {opportunity.closeDate ? formatDate(opportunity.closeDate) : undefined}
            </DField>
            <DField label="Loss reason" value={opportunity.lossReason} onAdd={openEdit} />
            <DField label="Country of execution" onAdd={openEdit}>{countryValue ?? undefined}</DField>
          </DefinitionCard>

          <DefinitionCard title="Commercials">
            <DField label="Currency" value={opportunity.currency} />
            <DField label="Est. gross margin" onAdd={openEdit}>
              {opportunity.estimatedGrossMarginPct != null ? `${opportunity.estimatedGrossMarginPct}%` : undefined}
            </DField>
            <DField label="Barter value" onAdd={openEdit}>{formattedBarter ?? undefined}</DField>
            <DField label="Recurring" value={opportunity.recurring ? "Yes" : "No"} />
          </DefinitionCard>

          <DefinitionCard title="Classification">
            <DField label="Service type" onAdd={openEdit}>{serviceTypeValue ?? undefined}</DField>
            <DField label="Property type" onAdd={openEdit}>{propertyTypeValue ?? undefined}</DField>
            <DField label="Billing entity" onAdd={openEdit}>{entityHint(opportunity.billingEntityId)}</DField>
            <DField label="Entity sales" onAdd={openEdit}>{entityHint(opportunity.entitySalesId)}</DField>
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
                  <dl className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                    <DField label="Created" value={formatDate(opportunity.createdAt)} />
                    <DField label="Last modified" value={formatDate(opportunity.updatedAt)} />
                  </dl>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Communications — moved below the deal fields (was in the rail). */}
          <Card>
            <CardContent className="pt-4">
              <Tabs defaultValue="activity">
                <TabsList className="w-full justify-start gap-4 rounded-none border-b border-border bg-transparent p-0">
                  {[
                    { v: "activity", label: "Activity" },
                    { v: "notes", label: "Notes" },
                    { v: "calls", label: "Calls" },
                    { v: "email", label: "Email" },
                  ].map(({ v, label }) => (
                    <TabsTab
                      key={v}
                      value={v}
                      className="rounded-none border-b-2 border-transparent px-0 py-1.5 text-[13px] data-active:border-primary data-active:bg-transparent data-active:text-foreground data-active:shadow-none"
                    >
                      {label}
                    </TabsTab>
                  ))}
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
                    <p className="py-6 text-center text-xs text-muted-foreground">No notes yet. Add one from the Activity tab.</p>
                  )}
                </TabsPanel>

                <TabsPanel value="calls">
                  {callActivities.length > 0 ? (
                    <ActivityTimeline activities={callActivities} />
                  ) : (
                    <p className="py-6 text-center text-xs text-muted-foreground">No calls logged yet. Log one from the Activity tab.</p>
                  )}
                </TabsPanel>

                <TabsPanel value="email">
                  <IntegrationTabEmptyState icon={Mail} message="Connect Gmail to send and log email from the CRM." />
                </TabsPanel>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Right rail — compact summary cards only. */}
        <div className="w-full shrink-0 space-y-4 lg:w-[372px]">
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

          <Card>
            <CardHeader>
              <CardTitle className={T.cardHeading}>Stage History</CardTitle>
            </CardHeader>
            <CardContent>
              {stageHistory.length > 0 ? (
                <StageHistoryTimeline history={stageHistory} />
              ) : (
                <p className="text-xs text-muted-foreground">No stage changes recorded yet.</p>
              )}
            </CardContent>
          </Card>

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
