"use client"

import { Phone, Mail, Video, FileText, CheckSquare, Clock, MapPin, Users } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { usePreferences } from "@/components/providers/preferences-provider"
import {
  formatMeetingTimeRange,
  readMeetingMetadata,
  summarizeAttendees,
} from "@/lib/meeting-format"

interface Activity {
  id: string
  type: "call" | "email" | "email_inbound" | "email_outbound" | "meeting" | "note" | "task"
  subject: string | null
  body: string | null
  userName: string | null
  createdAt: string
  opportunityName: string | null
  // Calendar fields (ORR-824) + meeting metadata, threaded through for the
  // meeting detail row (ORR-828). Optional so non-meeting callers can omit them.
  startsAt?: string | null
  endsAt?: string | null
  timeZone?: string | null
  allDay?: boolean
  metadata?: Record<string, unknown> | null
}

const activityIcons: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  email_inbound: Mail,
  email_outbound: Mail,
  meeting: Video,
  note: FileText,
  task: CheckSquare,
}

const activityColors: Record<string, string> = {
  call: "text-sky-600 bg-sky-100",
  email: "text-violet-600 bg-violet-100",
  email_inbound: "text-violet-600 bg-violet-100",
  email_outbound: "text-violet-600 bg-violet-100",
  meeting: "text-orange-600 bg-orange-100",
  note: "text-amber-600 bg-amber-100",
  task: "text-emerald-600 bg-emerald-100",
}

interface ActivityTimelineProps {
  activities: Activity[]
  maxItems?: number
}

export function ActivityTimeline({
  activities,
  maxItems = 6,
}: ActivityTimelineProps) {
  const { formatDateTime, dateFormat, timezone } = usePreferences()
  const display = activities.slice(0, maxItems)

  function formatTime(dateString: string) {
    return formatDateTime(dateString)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest updates from your team</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[360px] px-6">
          <div className="flex flex-col gap-1 pb-6">
            {display.map((activity, index) => {
              const Icon = activityIcons[activity.type] ?? FileText
              const colorClass = activityColors[activity.type] ?? "text-muted-foreground bg-muted"
              const isLast = index === display.length - 1

              // Meeting-specific detail (ORR-828). Only computed for meetings.
              const meeting =
                activity.type === "meeting"
                  ? readMeetingMetadata(activity.metadata)
                  : null
              const meetingTime =
                activity.type === "meeting"
                  ? formatMeetingTimeRange(
                      {
                        startsAt: activity.startsAt,
                        endsAt: activity.endsAt,
                        timeZone: activity.timeZone,
                        allDay: activity.allDay,
                      },
                      dateFormat,
                      timezone,
                    )
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
                <div key={activity.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "flex size-9 items-center justify-center rounded-full",
                        colorClass,
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    {!isLast && <div className="w-px flex-1 bg-border" />}
                  </div>

                  <div className={cn("flex-1 pb-6", isLast && "pb-0")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium leading-tight">
                          {activity.subject ?? "Untitled"}
                        </span>
                        {activity.body && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {activity.body}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatTime(activity.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Avatar className="size-5">
                        <AvatarFallback className="bg-muted text-[10px]">
                          {activity.userName
                            ? activity.userName
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                            : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">
                        {activity.userName ?? "Unknown"}
                      </span>
                      {activity.opportunityName && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {activity.opportunityName}
                          </span>
                        </>
                      )}
                    </div>
                    {hasMeetingDetail && meeting && (
                      <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
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
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
