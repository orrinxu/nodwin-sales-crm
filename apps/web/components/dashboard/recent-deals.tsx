"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StageBadge } from "@/components/primitives/stage-badge"
import type { DealStage } from "@/lib/opportunity/stage"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ArrowRight, Calendar, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatPreferenceDate, type DateFormatPreference } from "@/lib/format"
import Link from "next/link"

interface Deal {
  id: string
  name: string
  company: string | null
  stage: string
  stageLabel: string
  amount: string
  probabilityPct: number
  closeDate: string | null
}

interface RecentDealsProps {
  deals: Deal[]
  dateFormat: DateFormatPreference
  maxItems?: number
}

export function RecentDeals({ deals, dateFormat, maxItems = 5 }: RecentDealsProps) {
  const sorted = [...deals]
    .sort((a, b) => {
      if (!a.closeDate) return 1
      if (!b.closeDate) return -1
      return new Date(b.closeDate).getTime() - new Date(a.closeDate).getTime()
    })
    .slice(0, maxItems)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Deals</CardTitle>
          <CardDescription>Latest updates in your pipeline</CardDescription>
        </div>
        <Link href="/opportunities">
          <Button variant="ghost" size="sm" className="text-primary">
            View All
            <ArrowRight data-icon="inline-end" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          <div className="flex flex-col">
            {sorted.map((deal, index) => (
              <Link
                key={deal.id}
                href={`/opportunities/${deal.id}`}
                className={cn(
                  "group flex items-center justify-between px-6 py-4 transition-colors hover:bg-muted/50",
                  index < sorted.length - 1 && "border-b border-border",
                )}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{deal.name}</span>
                    <StageBadge
                      stage={deal.stage as DealStage}
                      label={deal.stageLabel}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {deal.company && (
                      <span className="flex items-center gap-1">
                        <Building2 className="size-3" />
                        {deal.company}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {formatPreferenceDate(deal.closeDate, dateFormat, "TBD")}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">
                    {deal.amount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {deal.probabilityPct}% likely
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
