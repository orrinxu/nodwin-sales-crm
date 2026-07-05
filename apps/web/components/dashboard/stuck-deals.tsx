"use client"

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertTriangle, Clock, CalendarX, Building2, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

export type StuckReason = "stale" | "overdue"

export interface StuckDealView {
  id: string
  name: string
  company: string | null
  stageLabel: string
  amount: string
  daysSinceLastActivity: number
  thresholdDays: number
  hasActivity: boolean
  reasons: StuckReason[]
  closeDate: string | null
}

interface Props {
  deals: StuckDealView[]
  totalAtRisk: string
  unconvertibleCount?: number
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "—"
  return new Date(dateString).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export function StuckDeals({ deals, totalAtRisk, unconvertibleCount = 0 }: Props) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" /> Stuck Deals
          </CardTitle>
          <CardDescription>Open deals that have gone quiet or are overdue</CardDescription>
        </div>
        {deals.length > 0 && (
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">{totalAtRisk}</div>
            <div className="text-xs text-muted-foreground">value at risk</div>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {deals.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="size-6 text-emerald-500" />
            No deals need attention right now.
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="flex flex-col">
              {deals.map((deal, index) => (
                <Link
                  key={deal.id}
                  href={`/opportunities/${deal.id}`}
                  className={cn(
                    "group flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-muted/50",
                    index < deals.length - 1 && "border-b border-border",
                  )}
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{deal.name}</span>
                      <Badge variant="secondary" className="text-xs">{deal.stageLabel}</Badge>
                      {deal.reasons.includes("overdue") && (
                        <Badge className="gap-1 bg-destructive/15 text-xs text-destructive">
                          <CalendarX className="size-3" /> Overdue
                        </Badge>
                      )}
                      {deal.reasons.includes("stale") && (
                        <Badge className="gap-1 bg-amber-100 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                          <Clock className="size-3" /> Stale
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {deal.company && (
                        <span className="flex items-center gap-1">
                          <Building2 className="size-3" /> {deal.company}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {deal.hasActivity
                          ? `${deal.daysSinceLastActivity}d since last activity`
                          : "No activity logged"}
                        <span className="text-muted-foreground/60">· threshold {deal.thresholdDays}d</span>
                      </span>
                      {deal.reasons.includes("overdue") && (
                        <span className="flex items-center gap-1 text-destructive">
                          <CalendarX className="size-3" /> close {formatDate(deal.closeDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-lg font-semibold tabular-nums">{deal.amount}</div>
                </Link>
              ))}
            </div>
          </ScrollArea>
        )}
        {unconvertibleCount > 0 && (
          <p className="border-t border-border px-6 py-2 text-xs text-muted-foreground">
            {unconvertibleCount} deal{unconvertibleCount === 1 ? "" : "s"} excluded from value at risk
            (no exchange rate to the reporting currency).
          </p>
        )}
      </CardContent>
    </Card>
  )
}
