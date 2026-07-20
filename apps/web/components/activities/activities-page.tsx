"use client"

import { useState, useMemo } from "react"
import {
  Phone,
  StickyNote,
  Mail,
  Calendar,
  CheckSquare,
  Clock,
  Layers,
  MapPin,
  Users,
  Video,
} from "lucide-react"
import Link from "next/link"

import type { ActivityRecord, ActivityType } from "@/lib/data/activities"
import { usePreferences } from "@/components/providers/preferences-provider"
import {
  formatMeetingTimeRange,
  readMeetingMetadata,
  summarizeAttendees,
} from "@/lib/meeting-format"

interface ActivitiesPageProps {
  activities: ActivityRecord[]
}

type FilterKey = "all" | "calls" | "emails" | "meetings" | "tasks" | "notes"

const filterTabs: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "calls", label: "Calls" },
  { key: "emails", label: "Emails" },
  { key: "meetings", label: "Meetings" },
  { key: "tasks", label: "Tasks" },
  { key: "notes", label: "Notes" },
]

function matchesFilter(type: ActivityType, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true
    case "calls":
      return type === "call"
    case "emails":
      return type === "email_inbound" || type === "email_outbound"
    case "meetings":
      return type === "meeting"
    case "tasks":
      return type === "task"
    case "notes":
      return type === "note"
  }
}

const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  call: Phone,
  email_inbound: Mail,
  email_outbound: Mail,
  meeting: Calendar,
  task: CheckSquare,
}

const activityLabels: Record<string, string> = {
  note: "Note",
  call: "Call",
  email_inbound: "Email",
  email_outbound: "Email",
  meeting: "Meeting",
  task: "Task",
}

function formatRelativeTime(
  dateStr: string,
  formatAbsolute: (value: string) => string,
): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatAbsolute(dateStr)
}

export function ActivitiesPage({ activities }: ActivitiesPageProps) {
  const { formatDate, dateFormat, timezone } = usePreferences()
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")

  const filtered = useMemo(
    () => activities.filter((a) => matchesFilter(a.type, activeFilter)),
    [activities, activeFilter],
  )

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activities</h1>
        <p className="text-sm text-muted-foreground">
          A chronological feed of all CRM activity.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {filterTabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveFilter(key)}
            className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeFilter === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No activities match this filter.
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((activity) => {
            const Icon = activityIcons[activity.type] ?? StickyNote
            const label = activityLabels[activity.type] ?? activity.type
            const duration = activity.metadata?.duration_minutes as number | undefined

            // Meeting-specific detail (ORR-828). Only computed for meetings.
            const meeting =
              activity.type === "meeting"
                ? readMeetingMetadata(activity.metadata)
                : null
            const meetingTime =
              activity.type === "meeting"
                ? formatMeetingTimeRange(activity, dateFormat, timezone)
                : null
            const attendeeSummary = meeting
              ? summarizeAttendees(meeting.attendees)
              : null
            const hasMeetingDetail =
              meeting != null &&
              (meetingTime != null ||
                meeting.location != null ||
                meeting.hangoutLink != null ||
                attendeeSummary != null)

            return (
              <div
                key={activity.id}
                className="flex items-start gap-4 rounded-lg border bg-card p-4"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-background">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    {activity.subject && (
                      <>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="truncate text-sm text-muted-foreground">
                          {activity.subject}
                        </span>
                      </>
                    )}
                  </div>
                  {activity.body && (
                    <p className="line-clamp-2 whitespace-pre-wrap text-sm">
                      {activity.body}
                    </p>
                  )}
                  {hasMeetingDetail && meeting && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {meetingTime && (
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="size-3 shrink-0" />
                          {meetingTime}
                        </span>
                      )}
                      {meeting.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3 shrink-0" />
                          {meeting.location}
                        </span>
                      )}
                      {attendeeSummary && (
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="size-3 shrink-0" />
                          {attendeeSummary}
                        </span>
                      )}
                      {meeting.hangoutLink && (
                        <a
                          href={meeting.hangoutLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-medium text-muted-foreground hover:text-foreground"
                        >
                          <Video className="size-3 shrink-0" />
                          Join
                        </a>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{activity.userName ?? "Unknown"}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(activity.createdAt, formatDate)}</span>
                    {duration != null && (
                      <>
                        <span>·</span>
                        <Clock className="size-3" />
                        <span>{duration} min</span>
                      </>
                    )}
                    {activity.opportunityName && activity.opportunityId && (
                      <>
                        <span>·</span>
                        <Link
                          href={`/opportunities/${activity.opportunityId}`}
                          className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-medium text-muted-foreground hover:text-foreground"
                        >
                          <Layers className="size-3" />
                          {activity.opportunityName}
                        </Link>
                      </>
                    )}
                    {activity.accountName && (
                      <>
                        <span>·</span>
                        <span>{activity.accountName}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
