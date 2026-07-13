"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Phone, Mail, CalendarClock, StickyNote } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { ActivityType } from "@/lib/data/activities"
import { logTouchAction } from "@/app/(crm)/dashboard/actions"

/**
 * "Reconnect" — the dashboard CTA on a deal that's gone quiet. Opens a small
 * dialog to log a real touch (call / email / meeting / note) against the deal.
 * Recording the activity resets the deal's last-contact clock, so it drops off
 * the "Needs my attention" list on refresh.
 *
 * This logs an activity the rep performed; it does NOT book a calendar meeting —
 * a real Calendar invite is a later upgrade (no Calendar integration exists yet).
 */

const TOUCH_TYPES = [
  { value: "call", label: "Call", icon: Phone },
  { value: "email_outbound", label: "Email", icon: Mail },
  { value: "meeting", label: "Meeting", icon: CalendarClock },
  { value: "note", label: "Note", icon: StickyNote },
] as const satisfies ReadonlyArray<{ value: ActivityType; label: string; icon: typeof Phone }>

interface ReconnectButtonProps {
  opportunityId: string
  dealName: string
}

export function ReconnectButton({ opportunityId, dealName }: ReconnectButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ActivityType>("call")
  const [subject, setSubject] = useState("")
  const [note, setNote] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = subject.trim().length > 0 || note.trim().length > 0

  async function submit() {
    if (!canSubmit || pending) return
    setPending(true)
    setError(null)
    try {
      await logTouchAction(opportunityId, {
        opportunityId,
        type,
        subject: subject.trim() || null,
        body: note.trim() || null,
        metadata: { logged_from: "dashboard_reconnect" },
      })
      setSubject("")
      setNote("")
      setType("call")
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log the touch. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="shrink-0" />}>
        <Phone className="size-3.5" />
        Reconnect
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a touch</DialogTitle>
          <DialogDescription className="truncate">{dealName}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Touch type">
            {TOUCH_TYPES.map((t) => {
              const Icon = t.icon
              const active = type === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-4" />
                  {t.label}
                </button>
              )
            })}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reconnect-subject">Subject</Label>
            <Input
              id="reconnect-subject"
              placeholder="e.g. Follow-up call"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reconnect-note">Note</Label>
            <textarea
              id="reconnect-note"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="What did you discuss or plan?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" size="sm" type="button" />}>
            Cancel
          </DialogClose>
          <Button type="button" size="sm" onClick={submit} disabled={!canSubmit || pending}>
            {pending ? "Logging…" : "Log touch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
