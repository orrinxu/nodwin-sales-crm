"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Money } from "@/lib/money"
import { getStageLabel } from "@/lib/data/opportunities.types"
import type { OpportunityRecord } from "@/lib/data/opportunities.types"

interface RecentDealsProps {
  deals: OpportunityRecord[]
}

type StageBadgeKey = "closed_won" | "closed_lost"

const stageColor: Record<StageBadgeKey, string> = {
  closed_won: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  closed_lost:
    "bg-destructive/10 text-destructive dark:bg-destructive/20",
}

function getStageBadgeClass(stage: string): string {
  if (stage === "closed_won") return stageColor.closed_won
  if (stage === "closed_lost") return stageColor.closed_lost
  return "bg-muted text-muted-foreground"
}

export function RecentDeals({ deals }: RecentDealsProps) {
  if (deals.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">Recent Deals</h2>
        <p className="py-8 text-center text-sm text-muted-foreground">
          No deals yet.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="mb-4 text-lg font-semibold">Recent Deals</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 font-medium">Deal</th>
              <th className="pb-2 font-medium">Account</th>
              <th className="pb-2 font-medium">Stage</th>
              <th className="pb-2 font-medium text-right">Amount</th>
              <th className="pb-2 font-medium">Owner</th>
              <th className="pb-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <tr key={deal.id} className="border-b last:border-0">
                <td className="py-2 font-medium">{deal.name}</td>
                <td className="py-2 text-muted-foreground">
                  {deal.accountName ?? "—"}
                </td>
                <td className="py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStageBadgeClass(deal.stage)}`}
                  >
                    {getStageLabel(deal.stage)}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">
                  {Money.fromAmount(deal.amount, deal.currency).toDisplay()}
                </td>
                <td className="py-2 text-muted-foreground">
                  {deal.ownerName ?? "—"}
                </td>
                <td className="py-2">
                  <Link
                    href={`/opportunities/${deal.id}`}
                    className="inline-flex items-center text-muted-foreground hover:text-foreground"
                  >
                    <ArrowUpRight className="size-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
