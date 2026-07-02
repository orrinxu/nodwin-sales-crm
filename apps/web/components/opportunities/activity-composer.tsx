"use client"

import { useState } from "react"
import { Phone, StickyNote } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

interface ActivityComposerProps {
  /** Entity id passed to createAction so the server action can revalidate its path. */
  revalidateId: string
  scope: ActivityScope
  createAction: (revalidateId: string, input: unknown) => Promise<ActivityRecord>
  onCreated?: () => void
}

export function ActivityComposer({
  revalidateId,
  scope,
  createAction,
  onCreated,
}: ActivityComposerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Log Activity</CardTitle>
      </CardHeader>
      <CardContent>
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
        </Tabs>
      </CardContent>
    </Card>
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

  const createNote = async () => {
    if (!body.trim()) return
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
  }

  return (
    <div className="mt-4 grid gap-3">
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
        <Button type="button" size="sm" onClick={createNote} disabled={!body.trim()}>
          Save Note
        </Button>
      </div>
    </div>
  )
}

function CallForm({ revalidateId, scope, createAction, onCreated }: FormProps) {
  const [subject, setSubject] = useState("")
  const [notes, setNotes] = useState("")
  const [duration, setDuration] = useState("")

  const logCall = async () => {
    if (!subject.trim() && !notes.trim()) return
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
  }

  return (
    <div className="mt-4 grid gap-3">
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
        <Button type="button" size="sm" onClick={logCall} disabled={!subject.trim() && !notes.trim()}>
          Log Call
        </Button>
      </div>
    </div>
  )
}
