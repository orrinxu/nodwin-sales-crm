/** Due-date bucketing for the task list (ORR-725). Pure — compared as YYYY-MM-DD strings. */

export type TaskDueBucket = "overdue" | "today" | "upcoming" | "undated"

export function bucketTaskDue(dueDate: string | null, todayIso: string): TaskDueBucket {
  if (!dueDate) return "undated"
  if (dueDate < todayIso) return "overdue"
  if (dueDate === todayIso) return "today"
  return "upcoming"
}

/** Local calendar date as YYYY-MM-DD (the user's "today", not UTC). */
export function localDateIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
