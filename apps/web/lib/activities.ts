import {
  Phone,
  StickyNote,
  Mail,
  Calendar,
  CheckSquare,
  Activity,
} from "lucide-react"

export const ACTIVITY_FILTER_TYPES = [
  "all",
  "calls",
  "emails",
  "meetings",
  "tasks",
  "notes",
] as const

export type ActivityFilterType = (typeof ACTIVITY_FILTER_TYPES)[number]

export const activityIcons: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  note: StickyNote,
  call: Phone,
  email_inbound: Mail,
  email_outbound: Mail,
  meeting: Calendar,
  task: CheckSquare,
}

export const activityLabels: Record<string, string> = {
  note: "Note",
  call: "Call",
  email_inbound: "Inbound Email",
  email_outbound: "Outbound Email",
  meeting: "Meeting",
  task: "Task",
}

export const filterLabels: Record<ActivityFilterType, string> = {
  all: "All",
  calls: "Calls",
  emails: "Emails",
  meetings: "Meetings",
  tasks: "Tasks",
  notes: "Notes",
}

export const filterIcons: Record<
  ActivityFilterType,
  React.ComponentType<{ className?: string }>
> = {
  all: Activity,
  calls: Phone,
  emails: Mail,
  meetings: Calendar,
  tasks: CheckSquare,
  notes: StickyNote,
}

const filterTypeMap: Record<Exclude<ActivityFilterType, "all">, string[]> = {
  calls: ["call"],
  emails: ["email_inbound", "email_outbound"],
  meetings: ["meeting"],
  tasks: ["task"],
  notes: ["note"],
}

export function matchesFilter(
  activityType: string,
  filter: ActivityFilterType,
): boolean {
  if (filter === "all") return true
  // eslint-disable-next-line security/detect-object-injection -- filter is typed ActivityFilterType, not user input
  return filterTypeMap[filter]?.includes(activityType) ?? false
}

export function formatRelativeTime(dateStr: string): string {
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
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
