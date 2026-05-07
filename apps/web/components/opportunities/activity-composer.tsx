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

interface ActivityComposerProps {
  opportunityId: string
  accountId: string | null
  createAction: (opportunityId: string, input: unknown) => Promise<ActivityRecord>
  onCreated?: () => void
}

export function ActivityComposer({
  opportunityId,
  accountId,
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
              opportunityId={opportunityId}
              accountId={accountId}
              createAction={createAction}
              onCreated={onCreated}
            />
          </TabsPanel>
          <TabsPanel value="call">
            <CallForm
              opportunityId={opportunityId}
              accountId={accountId}
              createAction={createAction}
              onCreated={onCreated}
            />
          </TabsPanel>
        </Tabs>
      </CardContent>
    </Card>
  )
}

interface NoteFormProps {
  opportunityId: string
  accountId: string | null
  createAction: (opportunityId: string, input: unknown) => Promise<ActivityRecord>
  onCreated?: () => void
}

function NoteForm({ opportunityId, accountId, createAction, onCreated }: NoteFormProps) {
  const [body, setBody] = useState("")
  const [subject, setSubject] = useState("")

  const createNote = async () => {
    if (!body.trim()) return
    await createAction(opportunityId, {
      opportunityId,
      accountId,
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

interface CallFormProps {
  opportunityId: string
  accountId: string | null
  createAction: (opportunityId: string, input: unknown) => Promise<ActivityRecord>
  onCreated?: () => void
}

function CallForm({ opportunityId, accountId, createAction, onCreated }: CallFormProps) {
  const [subject, setSubject] = useState("")
  const [notes, setNotes] = useState("")
  const [duration, setDuration] = useState("")

  const logCall = async () => {
    if (!subject.trim() && !notes.trim()) return
    await createAction(opportunityId, {
      opportunityId,
      accountId,
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
