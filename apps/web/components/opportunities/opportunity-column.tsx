"use client"

import { useDroppable } from "@dnd-kit/core"
import type { DealStage } from "@/lib/opportunity"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"
import { formatColumnTotal } from "@/lib/opportunity/kanban-intel"
import { OpportunityCard } from "@/components/opportunities/opportunity-card"

interface OpportunityColumnProps {
  stage: DealStage
  label: string
  opportunities: OpportunityRecord[]
}

export function OpportunityColumn({
  stage,
  label,
  opportunities,
}: OpportunityColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${stage}`,
    data: { stage },
  })

  const total = formatColumnTotal(opportunities)

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/30">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate text-sm font-medium">{label}</h3>
          {total ? (
            <span className="truncate text-xs tabular-nums text-muted-foreground">
              {total}
            </span>
          ) : null}
        </div>
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs tabular-nums text-muted-foreground">
          {opportunities.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors ${
          isOver ? "bg-muted/50" : ""
        }`}
      >
        {opportunities.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            Drop opportunities here
          </div>
        ) : (
          opportunities.map((opp) => (
            <OpportunityCard key={opp.id} opportunity={opp} />
          ))
        )}
      </div>
    </div>
  )
}
