"use client"

import Link from "next/link"
import { useDraggable } from "@dnd-kit/core"
import { GripVertical, Building2, DollarSign, User, Flame, Clock, Hourglass } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/primitives/status-badge"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"
import { isHotLead } from "@/lib/opportunity/kanban-intel"
import { overdueLabel, staleLabel } from "@/lib/opportunity/deal-health"
import { Money } from "@/lib/money"

interface OpportunityCardProps {
  opportunity: OpportunityRecord
}

// Stop pointerdown on interactive children from reaching the drag sensor, so a
// click on a link navigates instead of being swallowed as the start of a drag.
const stopDrag = (e: React.PointerEvent) => e.stopPropagation()

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

  const hot = isHotLead(opportunity)
  // Health signals are computed server-side in a batched pass and attached to the
  // record (see lib/data/deal-health.ts). Each is null when it does not apply.
  const overdue = opportunity.health?.overdue ?? null
  const stale = opportunity.health?.stale ?? null

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        className={`cursor-grab active:cursor-grabbing transition-shadow ${
          isDragging ? "opacity-50 shadow-lg" : "hover:shadow-md"
        }`}
        size="sm"
        {...attributes}
        {...listeners}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <span
              className="mt-0.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            >
              <GripVertical className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Link
                href={`/opportunities/${opportunity.id}`}
                onPointerDown={stopDrag}
                className="block cursor-pointer truncate text-sm font-medium leading-tight hover:underline"
              >
                {opportunity.name}
              </Link>
              {hot || overdue || stale ? (
                <div className="flex flex-wrap items-center gap-1">
                  {hot ? (
                    <Badge
                      variant="secondary"
                      className="bg-warning/15 text-warning"
                    >
                      <Flame className="size-3" />
                      Hot
                    </Badge>
                  ) : null}
                  {overdue ? (
                    <StatusBadge tone="destructive">
                      <Clock className="size-3" />
                      {overdueLabel(overdue.days)}
                    </StatusBadge>
                  ) : null}
                  {stale ? (
                    <StatusBadge tone="warning">
                      <Hourglass className="size-3" />
                      {staleLabel(stale.days)}
                    </StatusBadge>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="size-3 shrink-0" />
                {opportunity.accountName ? (
                  <Link
                    href={`/accounts/${opportunity.accountId}`}
                    onPointerDown={stopDrag}
                    className="cursor-pointer truncate hover:text-foreground hover:underline"
                  >
                    {opportunity.accountName}
                  </Link>
                ) : (
                  <span className="truncate">—</span>
                )}
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
                      ? "text-success"
                      : opportunity.probabilityPct >= 40
                        ? "text-warning"
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
