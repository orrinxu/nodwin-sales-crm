"use client"

import { useState } from "react"
import { CalendarDays, Phone, StickyNote } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel,
} from "@/components/ui/tabs"
import type { ActivityRecord, ActivityType } from "@/lib/data/activities"

/**
 * Fields identifying what an activity is scoped to (opportunity, account,
 * and/or contact). Spread verbatim into the create payload, so only the keys
 * relevant to the current view are sent.
 */
export type ActivityScope = {
  opportunityId?: string | null
  accountId?: string | null
  contactId?: string | null
}

/**
 * Outcome of creating a meeting: the activity plus whether it was pushed to the
 * user's Google Calendar. Structurally matches the `createMeetingAction` server
 * action's return (ORR-829); kept here so the composer needn't import a server
 * module.
 */
export interface MeetingCreateResult {
  activity: ActivityRecord
  pushed: boolean
  reason?: string
  pushWarning?: string
}

interface ActivityComposerProps {
  /** Entity id passed to createAction so the server action can revalidate its path. */
  revalidateId: string
  scope: ActivityScope
  createAction: (revalidateId: string, input: unknown) => Promise<ActivityRecord>
  /**
   * Optional meeting-create action (ORR-829). When provided, a "Meeting" tab is
   * shown that creates a meeting activity and best-effort pushes it to Google
   * Calendar, reporting whether the push happened / was skipped.
   */
  createMeetingAction?: (
    revalidateId: string,
    input: unknown,
  ) => Promise<MeetingCreateResult>
  onCreated?: () => void
  /**
   * Notes-only mode for account/contact pages: renders just the note form (no
   * Call tab, no wrapper card). Full activity logging (calls) lives on
   * opportunities.
   */
  notesOnly?: boolean
}

export function ActivityComposer({
  revalidateId,
  scope,
  createAction,
  createMeetingAction,
  onCreated,
  notesOnly = false,
}: ActivityComposerProps) {
  if (notesOnly) {
    return (
      <NoteForm
        revalidateId={revalidateId}
        scope={scope}
        createAction={createAction}
        onCreated={onCreated}
      />
    )
  }

  // No wrapping Card here: callers (the opportunity detail wrapper) supply their
  // own titled "Log activity" card, so an inner Card produced nested double
  // chrome. Render just the tabbed forms.
  return (
    <Tabs defaultValue="note">
      <TabsList>
        <TabsTab value="note">
          <StickyNote className="size-4" />
          Note
        </TabsTab>
        <TabsTab value="call">
          <Phone className="size-4" />
          Call
        </TabsTab>
        {createMeetingAction && (
          <TabsTab value="meeting">
            <CalendarDays className="size-4" />
            Meeting
          </TabsTab>
        )}
      </TabsList>
      <TabsPanel value="note">
        <NoteForm
          revalidateId={revalidateId}
          scope={scope}
          createAction={createAction}
          onCreated={onCreated}
        />
      </TabsPanel>
      <TabsPanel value="call">
        <CallForm
          revalidateId={revalidateId}
          scope={scope}
          createAction={createAction}
          onCreated={onCreated}
        />
      </TabsPanel>
      {createMeetingAction && (
        <TabsPanel value="meeting">
          <MeetingForm
            revalidateId={revalidateId}
            scope={scope}
            createMeetingAction={createMeetingAction}
            onCreated={onCreated}
          />
        </TabsPanel>
      )}
    </Tabs>
  )
}

interface FormProps {
  revalidateId: string
  scope: ActivityScope
  createAction: (revalidateId: string, input: unknown) => Promise<ActivityRecord>
  onCreated?: () => void
}

function NoteForm({ revalidateId, scope, createAction, onCreated }: FormProps) {
  const [body, setBody] = useState("")
  const [subject, setSubject] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createNote = async () => {
    if (!body.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      await createAction(revalidateId, {
        ...scope,
        type: "note" as ActivityType,
        subject: subject.trim() || null,
        body: body.trim(),
        metadata: {},
      })
      setBody("")
      setSubject("")
      onCreated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the note. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 grid gap-3">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="note-subject">Subject</Label>
        <Input
          id="note-subject"
          placeholder="Note subject (optional)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="note-body">Note</Label>
        <textarea
          id="note-body"
          className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Write your note..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={createNote} disabled={!body.trim() || saving}>
          {saving ? "Saving..." : "Save Note"}
        </Button>
      </div>
    </div>
  )
}

function CallForm({ revalidateId, scope, createAction, onCreated }: FormProps) {
  const [subject, setSubject] = useState("")
  const [notes, setNotes] = useState("")
  const [duration, setDuration] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const logCall = async () => {
    if ((!subject.trim() && !notes.trim()) || saving) return
    setSaving(true)
    setError(null)
    try {
      await createAction(revalidateId, {
        ...scope,
        type: "call" as ActivityType,
        subject: subject.trim() || null,
        body: notes.trim() || null,
        metadata: {
          duration_minutes: duration ? Number(duration) : null,
        },
      })
      setSubject("")
      setNotes("")
      setDuration("")
      onCreated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log the call. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 grid gap-3">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="call-subject">Subject</Label>
        <Input
          id="call-subject"
          placeholder="Call subject / topic"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="call-duration">Duration (minutes)</Label>
        <Input
          id="call-duration"
          type="number"
          min="0"
          placeholder="e.g. 15"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="call-notes">Notes</Label>
        <textarea
          id="call-notes"
          className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Call summary / notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={logCall} disabled={(!subject.trim() && !notes.trim()) || saving}>
          {saving ? "Logging..." : "Log Call"}
        </Button>
      </div>
    </div>
  )
}

interface MeetingFormProps {
  revalidateId: string
  scope: ActivityScope
  createMeetingAction: (
    revalidateId: string,
    input: unknown,
  ) => Promise<MeetingCreateResult>
  onCreated?: () => void
}

/** Best-effort browser timezone (falls back to UTC in unusual runtimes). */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/**
 * Convert a `datetime-local` value ("YYYY-MM-DDTHH:mm") into an ISO-8601 string
 * with an offset (the create schema requires `datetime({ offset:true })`).
 * All-day meetings anchor to UTC midnight on the picked calendar date so the
 * date never shifts when the push slices it back to `YYYY-MM-DD`.
 */
function toIso(localValue: string, allDay: boolean): string | null {
  if (!localValue) return null
  if (allDay) return `${localValue.slice(0, 10)}T00:00:00.000Z`
  const date = new Date(localValue)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function MeetingForm({
  revalidateId,
  scope,
  createMeetingAction,
  onCreated,
}: MeetingFormProps) {
  const [subject, setSubject] = useState("")
  const [notes, setNotes] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [timeZone, setTimeZone] = useState(browserTimeZone)
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState("")
  const [attendees, setAttendees] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const canSubmit = Boolean(subject.trim() && start && end)

  const createMeeting = async () => {
    if (!canSubmit || saving) return
    setSaving(true)
    setError(null)
    setNotice(null)

    const startsAt = toIso(start, allDay)
    const endsAt = toIso(end, allDay)
    if (!startsAt || !endsAt) {
      setError("Please provide a valid start and end time.")
      setSaving(false)
      return
    }
    if (new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
      setError("The end time must be after the start time.")
      setSaving(false)
      return
    }

    const attendeeEmails = attendees
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0)
      .map((email) => ({ email }))

    try {
      const result = await createMeetingAction(revalidateId, {
        ...scope,
        type: "meeting" as ActivityType,
        subject: subject.trim(),
        body: notes.trim() || null,
        startsAt,
        endsAt,
        timeZone: allDay ? null : timeZone.trim() || null,
        allDay,
        metadata: {
          location: location.trim() || null,
          attendees: attendeeEmails,
          source: "crm",
        },
      })

      // Surface whether the meeting reached Google Calendar.
      if (result.pushed) {
        setNotice("Meeting saved and added to your Google Calendar.")
      } else if (result.reason === "not_connected") {
        setNotice(
          "Meeting saved. Connect Google Calendar in Settings to sync meetings automatically.",
        )
      } else {
        setNotice(
          result.pushWarning ??
            "Meeting saved, but it could not be synced to Google Calendar.",
        )
      }

      setSubject("")
      setNotes("")
      setStart("")
      setEnd("")
      setLocation("")
      setAttendees("")
      setAllDay(false)
      onCreated?.()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't create the meeting. Please try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 grid gap-3">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {notice}
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="meeting-subject">Subject</Label>
        <Input
          id="meeting-subject"
          placeholder="Meeting subject / title"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="meeting-start">Starts</Label>
          <Input
            id="meeting-start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="meeting-end">Ends</Label>
          <Input
            id="meeting-end"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm" htmlFor="meeting-all-day">
          <input
            id="meeting-all-day"
            type="checkbox"
            className="size-4 rounded border-input"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          All day
        </label>
        {!allDay && (
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="meeting-tz">Time zone</Label>
            <Input
              id="meeting-tz"
              placeholder="e.g. Asia/Kolkata"
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="meeting-location">Location</Label>
        <Input
          id="meeting-location"
          placeholder="Location (optional)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="meeting-attendees">Attendee emails</Label>
        <Input
          id="meeting-attendees"
          placeholder="Comma-separated emails (optional)"
          value={attendees}
          onChange={(e) => setAttendees(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="meeting-notes">Notes</Label>
        <textarea
          id="meeting-notes"
          className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Agenda / notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={createMeeting}
          disabled={!canSubmit || saving}
        >
          {saving ? "Creating..." : "Create Meeting"}
        </Button>
      </div>
    </div>
  )
}
