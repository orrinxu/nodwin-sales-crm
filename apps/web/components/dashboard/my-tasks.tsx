"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { CircleAlert, Plus } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { bucketTaskDue, localDateIso, type TaskDueBucket } from "@/lib/tasks/bucket"
import { createTaskAction, completeTaskAction } from "@/app/(crm)/dashboard/actions"

export interface MyTask {
  id: string
  title: string
  dueDate: string | null
  priority: "low" | "normal" | "high"
  opportunityId: string | null
  opportunityName: string | null
  accountName: string | null
  contactName: string | null
}

interface MyTasksProps {
  tasks: MyTask[]
}

const BUCKET_META: { key: TaskDueBucket; label: string; tone: string }[] = [
  { key: "overdue", label: "Overdue", tone: "text-destructive" },
  { key: "today", label: "Today", tone: "text-warning" },
  { key: "upcoming", label: "Upcoming", tone: "text-muted-foreground" },
  { key: "undated", label: "No date", tone: "text-muted-foreground" },
]

function taskLink(t: MyTask): { href: string; label: string } | null {
  if (t.opportunityId) return { href: `/opportunities/${t.opportunityId}`, label: t.opportunityName ?? "Deal" }
  if (t.accountName) return { href: "", label: t.accountName }
  if (t.contactName) return { href: "", label: t.contactName }
  return null
}

export function MyTasks({ tasks }: MyTasksProps) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [busy, setBusy] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const today = localDateIso(new Date())
    const map: Record<TaskDueBucket, MyTask[]> = { overdue: [], today: [], upcoming: [], undated: [] }
    for (const t of tasks) map[bucketTaskDue(t.dueDate, today)].push(t)
    return map
  }, [tasks])

  async function handleAdd() {
    const trimmed = title.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await createTaskAction({ title: trimmed, dueDate: dueDate || undefined })
      setTitle("")
      setDueDate("")
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleComplete(id: string) {
    setCompleting(id)
    try {
      await completeTaskAction(id)
      router.refresh()
    } finally {
      setCompleting(null)
    }
  }

  const overdueCount = grouped.overdue.length
  const dueTodayCount = grouped.today.length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          My tasks
          {overdueCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              <CircleAlert className="size-3" />
              {overdueCount} overdue
            </span>
          ) : dueTodayCount > 0 ? (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
              {dueTodayCount} due today
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd() }}
            placeholder="Add a task…"
            className="min-w-[180px] flex-1"
          />
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-40"
            aria-label="Due date"
          />
          <Button size="sm" onClick={handleAdd} disabled={busy || !title.trim()}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>

        {tasks.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No open tasks. Add one above.</p>
        ) : (
          <div className="space-y-4">
            {BUCKET_META.filter((b) => grouped[b.key].length > 0).map((bucket) => (
              <div key={bucket.key} className="space-y-1.5">
                <p className={`text-xs font-semibold uppercase tracking-wide ${bucket.tone}`}>
                  {bucket.label} ({grouped[bucket.key].length})
                </p>
                {grouped[bucket.key].map((t) => {
                  const link = taskLink(t)
                  return (
                    <div key={t.id} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={false}
                        disabled={completing === t.id}
                        onCheckedChange={() => handleComplete(t.id)}
                        aria-label={`Complete ${t.title}`}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <span className={t.priority === "high" ? "font-medium" : ""}>{t.title}</span>
                        {link ? (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            ·{" "}
                            {link.href ? (
                              <Link href={link.href} className="hover:underline">{link.label}</Link>
                            ) : (
                              link.label
                            )}
                          </span>
                        ) : null}
                      </div>
                      {t.dueDate ? (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t.dueDate}</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
