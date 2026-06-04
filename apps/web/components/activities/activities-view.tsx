"use client"

import { useState, useMemo } from "react"
import { StickyNote, Clock, Building2, User } from "lucide-react"

import type { ActivityWithRelations } from "@/lib/data/activities"
import {
  activityIcons,
  activityLabels,
  filterLabels,
  filterIcons,
  matchesFilter,
  formatRelativeTime,
  ACTIVITY_FILTER_TYPES,
  type ActivityFilterType,
} from "@/lib/activities"
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

interface ActivitiesViewProps {
  activities: ActivityWithRelations[]
}

export function ActivitiesView({ activities }: ActivitiesViewProps) {
  const [filter, setFilter] = useState<ActivityFilterType>("all")

  const filtered = useMemo(() => {
    if (filter === "all") return activities
    return activities.filter((a) => matchesFilter(a.type, filter))
  }, [activities, filter])

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activities</h1>
        <p className="text-sm text-muted-foreground">
          Timeline of all activity across opportunities and contacts.
        </p>
      </div>

      <Tabs
        value={filter}
        onValueChange={(v) => {
          if (v) setFilter(v as ActivityFilterType)
        }}
      >
        <TabsList>
          {ACTIVITY_FILTER_TYPES.map((key) => {
            // eslint-disable-next-line security/detect-object-injection -- key is from const array
            const Icon = filterIcons[key]
            return (
              <TabsTab key={key} value={key} className="gap-1.5">
                <Icon className="size-3.5" />
                {/* eslint-disable-next-line security/detect-object-injection -- key is from const array */}
                {filterLabels[key]}
              </TabsTab>
            )
          })}
        </TabsList>
      </Tabs>

      <div className="relative">
        <div className="absolute left-[17px] top-2 bottom-2 w-px bg-border" />
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No activities match this filter.
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((activity) => {
              const Icon = activityIcons[activity.type] ?? StickyNote
              const label = activityLabels[activity.type] ?? activity.type
              const duration = activity.metadata
                ?.duration_minutes as number | undefined

              return (
                <div key={activity.id} className="relative flex gap-3 pl-1">
                  <div className="z-10 flex size-9 shrink-0 items-center justify-center rounded-full border bg-background">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 space-y-1.5 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{label}</span>
                      {activity.subject && (
                        <span className="text-sm text-muted-foreground">
                          {activity.subject}
                        </span>
                      )}
                    </div>
                    {activity.body && (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {activity.body}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="size-3" />
                      <span>{activity.userName ?? "Unknown"}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(activity.createdAt)}</span>
                      {duration != null && (
                        <>
                          <span>·</span>
                          <Clock className="size-3" />
                          <span>{duration} min</span>
                        </>
                      )}
                    </div>
                    {(activity.opportunityName || activity.accountName) && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {activity.opportunityName && (
                          <Badge variant="secondary" className="gap-1">
                            <Building2 className="size-3" />
                            {activity.opportunityName}
                          </Badge>
                        )}
                        {activity.accountName && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <div className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                              {activity.accountName.slice(0, 2).toUpperCase()}
                            </div>
                            {activity.accountName}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
