"use client"

import { useDraggable } from "@dnd-kit/core"
import { GripVertical, Building2, DollarSign, User, Flame, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"
import { isHotLead, isOverdue } from "@/lib/opportunity/kanban-intel"
import { Money } from "@/lib/money"

interface OpportunityCardProps {
  opportunity: OpportunityRecord
}

export function OpportunityCard({ opportunity }: OpportunityCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: opportunity.id,
      data: { opportunity },
    })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  const formattedAmount = Money.fromAmount(
    opportunity.amount,
    opportunity.currency,
  ).toDisplay()

  const todayIso = new Date().toISOString().slice(0, 10)
  const hot = isHotLead(opportunity)
  const overdue = isOverdue(opportunity, todayIso)

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card
        className={`cursor-grab active:cursor-grabbing transition-shadow ${
          isDragging ? "opacity-50 shadow-lg" : "hover:shadow-md"
        }`}
        size="sm"
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <button
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
              {...listeners}
              aria-label="Drag to move"
            >
              <GripVertical className="size-3.5" />
            </button>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="truncate text-sm font-medium leading-tight">
                {opportunity.name}
              </p>
              {hot || overdue ? (
                <div className="flex flex-wrap items-center gap-1">
                  {hot ? (
                    <Badge
                      variant="secondary"
                      className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                    >
                      <Flame className="size-3" />
                      Hot
                    </Badge>
                  ) : null}
                  {overdue ? (
                    <Badge variant="destructive">
                      <Clock className="size-3" />
                      Overdue
                    </Badge>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="size-3 shrink-0" />
                <span className="truncate">
                  {opportunity.accountName ?? "—"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <DollarSign className="size-3 shrink-0" />
                <span>{formattedAmount}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="size-3 shrink-0" />
                  <span className="truncate">
                    {opportunity.ownerName ?? "—"}
                  </span>
                </div>
                <span
                  className={`text-xs font-medium ${
                    opportunity.probabilityPct >= 70
                      ? "text-green-600"
                      : opportunity.probabilityPct >= 40
                        ? "text-amber-600"
                        : "text-muted-foreground"
                  }`}
                >
                  {opportunity.probabilityPct}%
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
