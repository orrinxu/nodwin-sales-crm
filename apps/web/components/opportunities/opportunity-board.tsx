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
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { OpportunityCard } from "@/components/opportunities/opportunity-card"
import { OpportunityColumn } from "@/components/opportunities/opportunity-column"
import { OpportunityForm } from "@/components/opportunities/opportunity-form"
import { OpportunityQuickCreate } from "@/components/opportunities/opportunity-quick-create"

interface OpportunityBoardProps {
  opportunities: OpportunityRecord[]
  accounts: AccountOption[]
  businessUnits: BusinessUnitOption[]
  stageLabels: Record<string, string>
  lossReasons: { id: string; label: string }[]
  createAction: (input: OpportunityCreateInput) => Promise<OpportunityRecord>
  updateStageAction: (
    id: string,
    input: { stage: string; lossReason?: string | null },
  ) => Promise<OpportunityRecord>
}

export function OpportunityBoard({
  opportunities,
  accounts,
  businessUnits,
  stageLabels,
  lossReasons,
  createAction,
  updateStageAction,
}: OpportunityBoardProps) {
  const router = useRouter()
  const [activeOpportunity, setActiveOpportunity] =
    useState<OpportunityRecord | null>(null)
  const [pendingCloseLost, setPendingCloseLost] = useState<{
    opp: OpportunityRecord
  } | null>(null)
  const [lossReason, setLossReason] = useState("")
  const [isPending, setIsPending] = useState(false)

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

      if (targetStage === "closed_lost") {
        setPendingCloseLost({ opp })
        setLossReason("")
        return
      }

      try {
        await updateStageAction(opp.id, { stage: targetStage })
        router.refresh()
      } catch {
        // Stage transition was rejected (DB trigger or validation)
      }
    },
    [updateStageAction, router],
  )

  const handleConfirmCloseLost = useCallback(async () => {
    if (!pendingCloseLost) return
    setIsPending(true)
    try {
      await updateStageAction(pendingCloseLost.opp.id, {
        stage: "closed_lost",
        lossReason: lossReason || null,
      })
      setPendingCloseLost(null)
      setLossReason("")
      router.refresh()
    } catch {
      // handled
    } finally {
      setIsPending(false)
    }
  }, [pendingCloseLost, lossReason, updateStageAction, router])

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 flex-col gap-4 p-6 pt-0">
          <div className="flex items-center justify-end gap-2">
            <OpportunityQuickCreate
              accounts={accounts}
              businessUnits={businessUnits}
              createAction={createAction}
              onSuccess={() => router.refresh()}
            />
            <OpportunityForm
              accounts={accounts}
              businessUnits={businessUnits}
              createAction={createAction}
              onSuccess={() => router.refresh()}
            />
          </div>

          <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
            {columns.map((stage) => {
              const items = opportunitiesByStage.get(stage) ?? []
              return (
                <OpportunityColumn
                  key={stage}
                  stage={stage}
                  label={getStageLabel(stage, stageLabels)}
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

      <Dialog
        open={!!pendingCloseLost}
        onOpenChange={(open) => {
          if (!open) setPendingCloseLost(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Lost</DialogTitle>
            <DialogDescription>
              Select a reason for closing this opportunity as lost.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={lossReason} onValueChange={(v) => setLossReason(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {lossReasons.map((r) => (
                  <SelectItem key={r.id} value={r.label}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingCloseLost(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmCloseLost} disabled={isPending}>
              {isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
