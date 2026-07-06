"use client"

import { useDroppable } from "@dnd-kit/core"
import type { DealStage } from "@/lib/opportunity"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"
import type { StageTotal } from "@/lib/data/stage-totals"
import { Money } from "@/lib/money"
import { STAGE } from "@/lib/theme/stage"
import { OpportunityCard } from "@/components/opportunities/opportunity-card"

interface OpportunityColumnProps {
  stage: DealStage
  label: string
  opportunities: OpportunityRecord[]
  /** FX-normalised money totals for this stage, in `currency`. */
  stageTotal?: StageTotal
  /** Reporting currency the totals are expressed in. */
  currency?: string
}

export function OpportunityColumn({
  stage,
  label,
  opportunities,
  stageTotal,
  currency,
}: OpportunityColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${stage}`,
    data: { stage },
  })

  // Totals are FX-normalised into the reporting currency upstream, so the whole
  // column collapses to a single money figure (never mixed currencies).
  const money = (value: number) =>
    currency ? Money.fromAmount(value, currency).toDisplay() : null
  const totalDisplay =
    stageTotal && opportunities.length > 0 ? money(stageTotal.total) : null
  const weightedDisplay =
    stageTotal && opportunities.length > 0 ? money(stageTotal.weighted) : null
  // stage is a typed DealStage key, so the lookup is safe.
  // eslint-disable-next-line security/detect-object-injection
  const colors = STAGE[stage]

  return (
    <div
      className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-t-2 border-border bg-muted/30"
      style={{ borderTopColor: colors.chartSolid }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: colors.chartSolid }}
            />
            <h3 className="truncate text-sm font-medium">{label}</h3>
          </div>
          {totalDisplay ? (
            <span className="flex min-w-0 items-baseline gap-1.5 text-xs tabular-nums">
              <span className="truncate font-medium text-muted-foreground">
                {totalDisplay}
              </span>
              {weightedDisplay ? (
                <span className="shrink-0 text-muted-foreground/70">
                  {weightedDisplay} wtd
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        <span
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums"
          style={{ backgroundColor: colors.badgeBg, color: colors.badgeFg }}
        >
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
