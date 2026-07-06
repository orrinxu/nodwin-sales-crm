import Link from "next/link"
import { Bell, Clock, CalendarX, CheckCircle2 } from "lucide-react"

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StageBadge } from "@/components/primitives/stage-badge"
import { EmptyState } from "@/components/primitives/empty-state"
import type { DealStage } from "@/lib/opportunity/stage"
import type { LucideIcon } from "lucide-react"

export interface NeedsAttentionItemView {
  id: string
  name: string
  stage: DealStage
  stageLabel: string
  reason: string
}

export interface NeedsAttentionBucketView {
  items: NeedsAttentionItemView[]
  count: number
}

interface Props {
  stale: NeedsAttentionBucketView
  overdue: NeedsAttentionBucketView
  approvals: NeedsAttentionBucketView
  total: number
}

interface SectionSpec {
  key: string
  title: string
  icon: LucideIcon
  bucket: NeedsAttentionBucketView
}

function BucketSection({ title, icon: Icon, bucket }: Omit<SectionSpec, "key">) {
  if (bucket.count === 0) return null
  const hidden = bucket.count - bucket.items.length
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-6 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
        <Badge className="ml-auto bg-muted text-xs tabular-nums text-foreground">
          {bucket.count}
        </Badge>
      </div>
      <div className="flex flex-col">
        {bucket.items.map((item) => (
          <Link
            key={`${title}-${item.id}`}
            href={`/opportunities/${item.id}`}
            className="group flex items-center justify-between gap-3 border-t border-border px-6 py-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate font-medium">{item.name}</span>
              <StageBadge stage={item.stage} label={item.stageLabel} />
            </div>
            <span className="shrink-0 text-sm text-muted-foreground">{item.reason}</span>
          </Link>
        ))}
        {hidden > 0 && (
          <Link
            href="/opportunities"
            className="border-t border-border px-6 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            +{hidden} more
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * "Needs my attention" — a personalised, actionable roll-up for the signed-in
 * user: stale deals, overdue deals, and approvals awaiting their decision. All
 * data is owner/approver-scoped by the data layer (RLS-respecting).
 */
export function NeedsAttention({ stale, overdue, approvals, total }: Props) {
  const sections: SectionSpec[] = [
    { key: "overdue", title: "Overdue", icon: CalendarX, bucket: overdue },
    { key: "stale", title: "Stale deals", icon: Clock, bucket: stale },
    { key: "approvals", title: "Approvals awaiting me", icon: CheckCircle2, bucket: approvals },
  ]

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4 text-primary" /> Needs my attention
          </CardTitle>
          <CardDescription>Your stale deals, overdue deals, and approvals to action</CardDescription>
        </div>
        {total > 0 && (
          <Badge className="bg-primary/15 text-sm tabular-nums text-primary">{total}</Badge>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {total === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="You're all caught up"
            description="Nothing needs your attention right now."
          />
        ) : (
          <div className="flex flex-col pb-2">
            {sections.map(({ key, ...spec }) => (
              <BucketSection key={key} {...spec} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
