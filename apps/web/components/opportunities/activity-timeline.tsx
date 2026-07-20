"use client"

import {
  Phone,
  StickyNote,
  Mail,
  Calendar,
  CheckSquare,
  Clock,
  MapPin,
  Users,
  Video,
} from "lucide-react"

import type { ActivityRecord } from "@/lib/data/activities"
import { usePreferences } from "@/components/providers/preferences-provider"
import {
  formatMeetingTimeRange,
  readMeetingMetadata,
  summarizeAttendees,
} from "@/lib/meeting-format"

interface ActivityTimelineProps {
  activities: ActivityRecord[]
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
  email_inbound: "Inbound Email",
  email_outbound: "Outbound Email",
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

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const { formatDate, dateFormat, timezone } = usePreferences()

  if (activities.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No activities yet. Log a note or call above.
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="absolute left-[17px] top-2 bottom-2 w-px bg-border" />
      <div className="grid gap-4">
        {activities.map((activity) => {
          const Icon = activityIcons[activity.type] ?? StickyNote
          const label = activityLabels[activity.type] ?? activity.type
          const duration = activity.metadata?.duration_minutes as number | undefined

          // Meeting-specific detail (ORR-828): time range + location/link/attendees.
          // Only computed for meetings; everything else renders exactly as before.
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
            <div key={activity.id} className="relative flex gap-3 pl-1">
              <div className="z-10 flex size-9 items-center justify-center rounded-full border bg-background">
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-1 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{label}</span>
                  {activity.subject && (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-sm text-muted-foreground">{activity.subject}</span>
                    </>
                  )}
                </div>
                {activity.body && (
                  <p className="whitespace-pre-wrap text-sm">{activity.body}</p>
                )}
                {hasMeetingDetail && meeting && (
                  <div className="flex flex-col gap-1 pt-0.5 text-xs text-muted-foreground">
                    {meetingTime && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="size-3 shrink-0" />
                        <span>{meetingTime}</span>
                      </div>
                    )}
                    {meeting.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="size-3 shrink-0" />
                        <span>{meeting.location}</span>
                      </div>
                    )}
                    {attendeeSummary && (
                      <div className="flex items-center gap-1.5">
                        <Users className="size-3 shrink-0" />
                        <span>{attendeeSummary}</span>
                      </div>
                    )}
                    {meeting.hangoutLink && (
                      <a
                        href={meeting.hangoutLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-fit items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-medium text-muted-foreground hover:text-foreground"
                      >
                        <Video className="size-3 shrink-0" />
                        Join
                      </a>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
