"use client"

import { useCallback, useState } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { useRouter } from "next/navigation"

import {
  NON_TERMINAL_STAGES,
  TERMINAL_STAGES,
  type DealStage,
} from "@/lib/opportunity"
import {
  getStageLabel,
  type OpportunityRecord,
} from "@/lib/data/opportunities.types"
import type { OpportunityCreateInput, BusinessUnitOption } from "@/lib/data/opportunities.types"
import type { StageTotal, StageTotals } from "@/lib/data/stage-totals"
import type { AccountOption } from "@/lib/data/contacts"
import type { EntityOption } from "@/components/entity-combobox"
import type { FieldDefinition } from "@/lib/data/field-definitions.types"
import { OpportunityCard } from "@/components/opportunities/opportunity-card"
import { OpportunityColumn } from "@/components/opportunities/opportunity-column"
import { OpportunityForm } from "@/components/opportunities/opportunity-form"
import { OpportunityGenerator } from "@/components/opportunities/opportunity-generator"
import type { GenerateOpportunityResult, ExtractFileResult, TranscribeAudioResult } from "@/app/(crm)/opportunities/generate-actions"

interface OpportunityBoardProps {
  opportunities: OpportunityRecord[]
  /** FX-normalised per-stage count / total / weighted, in the reporting currency. */
  stageTotals?: StageTotals
  /**
   * Total deals in scope across the whole board (ORR-755). The board renders a
   * BOUNDED set of cards; when the scope has more deals than were fetched, a
   * note tells the user the columns show the most recent N. The per-stage TOTALS
   * (from stageTotals) stay accurate over the full scope regardless.
   */
  totalCount?: number
  accounts: AccountOption[]
  businessUnits: BusinessUnitOption[]
  users?: EntityOption[]
  /** Admin-defined opportunity custom fields for the create dialog. */
  fieldDefinitions?: FieldDefinition[]
  createAction: (input: OpportunityCreateInput) => Promise<OpportunityRecord>
  /** ORR-677: when provided, "Create Opportunity" opens the AI generator chooser. */
  generateAction?: (input: { text?: string; images?: { mimeType: string; dataBase64: string }[] }) => Promise<GenerateOpportunityResult>
  extractFileAction?: (formData: FormData) => Promise<ExtractFileResult>
  transcribeAction?: (formData: FormData) => Promise<TranscribeAudioResult>
  updateStageAction: (
    id: string,
    input: { stage: string },
  ) => Promise<OpportunityRecord>
  searchAccountsAction?: (query: string) => Promise<EntityOption[]>
  searchContactsAction?: (query: string, accountId?: string) => Promise<EntityOption[]>
  searchUsersAction?: (query: string) => Promise<EntityOption[]>
  createContactQuickAction?: (input: { fullName: string; email?: string; accountId?: string }) => Promise<EntityOption>
  createAccountQuickAction?: (input: { name: string }) => Promise<EntityOption>
  defaultCurrency?: string
}

export function OpportunityBoard({
  opportunities,
  stageTotals,
  totalCount,
  accounts,
  businessUnits,
  users,
  fieldDefinitions,
  createAction,
  generateAction,
  extractFileAction,
  transcribeAction,
  updateStageAction,
  searchAccountsAction,
  searchContactsAction,
  searchUsersAction,
  createContactQuickAction,
  createAccountQuickAction,
  defaultCurrency,
}: OpportunityBoardProps) {
  const router = useRouter()
  const [activeOpportunity, setActiveOpportunity] =
    useState<OpportunityRecord | null>(null)
  // Surfaces a rejected stage move (approval gate, illegal transition) — the
  // server's messages here are user-facing, so a silent catch hid real feedback.
  const [dragError, setDragError] = useState<string | null>(null)

  const columns = [...NON_TERMINAL_STAGES, ...TERMINAL_STAGES]

  const opportunitiesByStage = new Map<DealStage, OpportunityRecord[]>()
  for (const stage of columns) {
    opportunitiesByStage.set(stage, [])
  }
  for (const opp of opportunities) {
    const list = opportunitiesByStage.get(opp.stage)
    if (list) {
      list.push(opp)
    }
  }

  // Build a Map keyed by stage so column lookups avoid a dynamic object-index
  // sink. byStage is a plain (serialisable) record of the FX-normalised totals.
  const totalsByStage = new Map<DealStage, StageTotal>(
    Object.entries(stageTotals?.byStage ?? {}) as Array<[DealStage, StageTotal]>,
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const opp = event.active.data.current?.opportunity as
      | OpportunityRecord
      | undefined
    if (opp) {
      setActiveOpportunity(opp)
    }
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveOpportunity(null)

      const { active, over } = event
      if (!over) return

      const opp = active.data.current?.opportunity as
        | OpportunityRecord
        | undefined
      if (!opp) return

      const targetStage = over.data.current?.stage as DealStage | undefined
      if (!targetStage) return

      if (opp.stage === targetStage) return

      setDragError(null)
      try {
        await updateStageAction(opp.id, { stage: targetStage })
        router.refresh()
      } catch (err) {
        // Stage transition was rejected (approval gate / DB trigger / validation).
        // These messages are meant for the user — surface them instead of the
        // card silently snapping back with no explanation.
        setDragError(
          err instanceof Error && err.message
            ? err.message
            : `Couldn't move "${opp.name}" to ${getStageLabel(targetStage)}.`,
        )
      }
    },
    [updateStageAction, router],
  )

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0 lg:p-6 lg:pt-0">
        <div className="flex items-center justify-end gap-2">
          {generateAction ? (
            <OpportunityGenerator
              accounts={accounts}
              businessUnits={businessUnits}
              users={users}
              fieldDefinitions={fieldDefinitions}
              createAction={createAction}
              generateAction={generateAction}
              extractFileAction={extractFileAction}
              transcribeAction={transcribeAction}
              onSuccess={() => router.refresh()}
              searchAccountsAction={searchAccountsAction}
              searchContactsAction={searchContactsAction}
              searchUsersAction={searchUsersAction}
              createContactQuickAction={createContactQuickAction}
              createAccountQuickAction={createAccountQuickAction}
              defaultCurrency={defaultCurrency}
            />
          ) : (
            <OpportunityForm
              accounts={accounts}
              businessUnits={businessUnits}
              users={users}
              fieldDefinitions={fieldDefinitions}
              createAction={createAction}
              onSuccess={() => router.refresh()}
              searchAccountsAction={searchAccountsAction}
              searchContactsAction={searchContactsAction}
              searchUsersAction={searchUsersAction}
              createContactQuickAction={createContactQuickAction}
              createAccountQuickAction={createAccountQuickAction}
              defaultCurrency={defaultCurrency}
            />
          )}
        </div>

        {dragError ? (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            <span>{dragError}</span>
            <button
              type="button"
              onClick={() => setDragError(null)}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {totalCount != null && totalCount > opportunities.length ? (
          <p className="text-sm text-muted-foreground">
            Showing the {opportunities.length.toLocaleString()} most recently
            updated of {totalCount.toLocaleString()} deals. Column totals reflect
            all deals in scope — switch to Table view to page through every deal.
          </p>
        ) : null}

        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {columns.map((stage) => {
            const items = opportunitiesByStage.get(stage) ?? []
            return (
              <OpportunityColumn
                key={stage}
                stage={stage}
                label={getStageLabel(stage)}
                opportunities={items}
                stageTotal={totalsByStage.get(stage)}
                currency={stageTotals?.currency}
              />
            )
          })}
        </div>
      </div>

      <DragOverlay>
        {activeOpportunity ? (
          <div className="w-72">
            <OpportunityCard opportunity={activeOpportunity} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
