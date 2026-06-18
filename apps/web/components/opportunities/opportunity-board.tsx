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
import type { AccountOption } from "@/lib/data/contacts"
import type { EntityOption } from "@/components/entity-combobox"
import { OpportunityCard } from "@/components/opportunities/opportunity-card"
import { OpportunityColumn } from "@/components/opportunities/opportunity-column"
import { OpportunityForm } from "@/components/opportunities/opportunity-form"
import { OpportunityQuickCreate } from "@/components/opportunities/opportunity-quick-create"

interface OpportunityBoardProps {
  opportunities: OpportunityRecord[]
  accounts: AccountOption[]
  businessUnits: BusinessUnitOption[]
  users?: EntityOption[]
  createAction: (input: OpportunityCreateInput) => Promise<OpportunityRecord>
  updateStageAction: (
    id: string,
    input: { stage: string },
  ) => Promise<OpportunityRecord>
  searchAccountsAction?: (query: string) => Promise<EntityOption[]>
  searchContactsAction?: (query: string, accountId?: string) => Promise<EntityOption[]>
  searchUsersAction?: (query: string) => Promise<EntityOption[]>
  searchEntitiesAction?: (query: string) => Promise<EntityOption[]>
  createContactQuickAction?: (input: { fullName: string; email?: string; accountId?: string }) => Promise<EntityOption>
}

export function OpportunityBoard({
  opportunities,
  accounts,
  businessUnits,
  users,
  createAction,
  updateStageAction,
  searchAccountsAction,
  searchContactsAction,
  searchUsersAction,
  searchEntitiesAction,
  createContactQuickAction,
}: OpportunityBoardProps) {
  const router = useRouter()
  const [activeOpportunity, setActiveOpportunity] =
    useState<OpportunityRecord | null>(null)

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

      try {
        await updateStageAction(opp.id, { stage: targetStage })
        router.refresh()
      } catch {
        // Stage transition was rejected (DB trigger or validation)
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
          <OpportunityQuickCreate
            accounts={accounts.map((a) => ({ id: a.id, label: a.name }))}
            businessUnits={businessUnits}
            createAction={createAction}
            onSuccess={() => router.refresh()}
            searchAccountsAction={searchAccountsAction}
          />
          <OpportunityForm
            accounts={accounts}
            businessUnits={businessUnits}
            users={users}
            createAction={createAction}
            onSuccess={() => router.refresh()}
            searchAccountsAction={searchAccountsAction}
            searchContactsAction={searchContactsAction}
            searchUsersAction={searchUsersAction}
            searchEntitiesAction={searchEntitiesAction}
            createContactQuickAction={createContactQuickAction}
          />
        </div>

        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {columns.map((stage) => {
            const items = opportunitiesByStage.get(stage) ?? []
            return (
              <OpportunityColumn
                key={stage}
                stage={stage}
                label={getStageLabel(stage)}
                opportunities={items}
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
