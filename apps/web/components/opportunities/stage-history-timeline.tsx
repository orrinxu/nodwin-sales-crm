"use client"

import {
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertTriangle,
} from "lucide-react"

import { Card } from "@/components/ui/card"
import { getStageLabel } from "@/lib/data/opportunities.types"
import type { StageHistoryRecord } from "@/lib/data/opportunity-stage-history"

interface StageHistoryTimelineProps {
  history: StageHistoryRecord[]
}

// Event colours map onto the FIXED semantic tokens (success/warning/info/
// destructive) rather than hard-coded Tailwind palette literals, so the
// timeline follows the design system and both themes.
const eventConfig: Record<string, { icon: typeof ArrowUp; color: string; label: string }> = {
  ADVANCE: {
    icon: ArrowUp,
    color: "text-info bg-info/12",
    label: "Advanced",
  },
  MOVE_BACKWARD: {
    icon: ArrowDown,
    color: "text-warning bg-warning/15",
    label: "Moved Back",
  },
  CLOSE_WON: {
    icon: CheckCircle2,
    color: "text-success bg-success/12",
    label: "Closed Won",
  },
  CLOSE_LOST: {
    icon: XCircle,
    color: "text-destructive bg-destructive/12",
    label: "Closed Lost",
  },
  REOPEN: {
    icon: RotateCcw,
    color: "text-foreground bg-muted",
    label: "Reopened",
  },
  FORCE_STAGE: {
    icon: AlertTriangle,
    color: "text-warning bg-warning/15",
    label: "Forced",
  },
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  })
}

function groupByDate(entries: StageHistoryRecord[]): Map<string, StageHistoryRecord[]> {
  const groups = new Map<string, StageHistoryRecord[]>()
  for (const entry of entries) {
    const dateKey = formatDate(entry.createdAt)
    const group = groups.get(dateKey) ?? []
    group.push(entry)
    groups.set(dateKey, group)
  }
  return groups
}

export function StageHistoryTimeline({ history }: StageHistoryTimelineProps) {
  if (history.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No stage changes recorded yet.
      </p>
    )
  }

  const groups = groupByDate(history)

  return (
    <div className="py-4">
      {Array.from(groups.entries()).map(([dateLabel, entries]) => (
        <div key={dateLabel}>
          <div className="mb-3 mt-6 first:mt-0">
            <span className="text-xs font-medium text-muted-foreground">
              {dateLabel}
            </span>
          </div>
          <div className="relative pl-8">
            <div className="absolute bottom-0 left-[15px] top-0 w-px bg-border" />
            {entries.map((entry) => {
              const config = eventConfig[entry.event] ?? eventConfig.ADVANCE
              const Icon = config.icon

              return (
                <div key={entry.id} className="relative pb-6 last:pb-0">
                  <div
                    className={`absolute -left-[23px] flex size-7 items-center justify-center rounded-full ring-4 ring-background ${config.color}`}
                  >
                    <Icon className="size-3.5" />
                  </div>

                  <Card className="shadow-none">
                    <div className="flex items-start justify-between gap-2 p-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {getStageLabel(entry.fromStage)}
                          </span>
                          <ArrowUp className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {getStageLabel(entry.toStage)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${config.color}`}
                          >
                            {config.label}
                          </span>
                          {entry.createdByName && (
                            <span>by {entry.createdByName}</span>
                          )}
                        </div>
                        {entry.reason && (
                          <p className="text-xs text-muted-foreground">
                            {entry.reason}
                          </p>
                        )}
                      </div>
                      <time className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </time>
                    </div>
                  </Card>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
