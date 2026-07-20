"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Save, Send, Trash2, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SlackConnection } from "@/lib/data/slack"

// The routable events (labels for the UI). The server-side enum/schema is the
// source of truth for validation; this is presentation copy.
const SLACK_EVENTS: { value: string; label: string }[] = [
  { value: "stage_change", label: "Deal stage changed" },
  { value: "deal_won", label: "Deal won" },
  { value: "deal_lost", label: "Deal lost" },
  { value: "deal_assigned", label: "Deal assigned" },
  { value: "approval_requested", label: "Approval requested" },
]

interface SlackConnectionsFormProps {
  connections: SlackConnection[]
  eventRouting: Record<string, boolean>
  saveAction: (input: unknown) => Promise<void>
  deleteAction: (id: string) => Promise<void>
  setEventRoutingAction: (input: unknown) => Promise<void>
  testAction: (connectionId: string) => Promise<{ ok: boolean }>
}

export function SlackConnectionsForm({
  connections,
  eventRouting,
  saveAction,
  deleteAction,
  setEventRoutingAction,
  testAction,
}: SlackConnectionsFormProps) {
  const router = useRouter()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [channelLabel, setChannelLabel] = useState("")
  const [webhookUrl, setWebhookUrl] = useState("")

  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, string>>({})

  const [routing, setRouting] = useState<Record<string, boolean>>(eventRouting)
  const [routingError, setRoutingError] = useState<string | null>(null)

  function resetForm() {
    setEditingId(null)
    setName("")
    setChannelLabel("")
    setWebhookUrl("")
  }

  async function handleSave() {
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      await saveAction({
        id: editingId ?? undefined,
        workspaceName: name,
        channelLabel: channelLabel || null,
        webhookUrl, // blank on edit = keep existing (write-only)
      })
      setSaved(true)
      resetForm()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setPending(false)
    }
  }

  function handleEdit(conn: SlackConnection) {
    setEditingId(conn.id)
    setName(conn.workspaceName ?? "")
    setChannelLabel(conn.channelLabel ?? "")
    setWebhookUrl("") // never prefilled — write-only
    setSaved(false)
    setError(null)
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteAction(id)
      if (editingId === id) resetForm()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete")
    }
  }

  async function handleTest(id: string) {
    setTestingId(id)
    setTestResult((r) => ({ ...r, [id]: "" }))
    try {
      const { ok } = await testAction(id)
      setTestResult((r) => ({
        ...r,
        [id]: ok ? "✅ Sent — check the channel." : "❌ Slack rejected the message.",
      }))
    } catch (e) {
      setTestResult((r) => ({ ...r, [id]: `❌ ${e instanceof Error ? e.message : "Test failed"}` }))
    } finally {
      setTestingId(null)
    }
  }

  async function toggleEvent(value: string, next: boolean) {
    setRouting((r) => ({ ...r, [value]: next }))
    setRoutingError(null)
    try {
      await setEventRoutingAction({ eventType: value, enabled: next })
    } catch (e) {
      setRouting((r) => ({ ...r, [value]: !next })) // revert
      setRoutingError(e instanceof Error ? e.message : "Failed to update")
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Slack</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Post deal notifications to a Slack channel. Create an{" "}
          <a
            href="https://api.slack.com/messaging/webhooks"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            incoming webhook
          </a>{" "}
          in Slack, then paste its URL below. The URL is stored securely and never shown again.
        </p>
      </div>

      {/* Existing connections */}
      {connections.length > 0 && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-sm">Connected channels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {connections.map((conn) => (
              <div key={conn.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{conn.workspaceName ?? "Slack channel"}</span>
                      {conn.channelLabel && (
                        <span className="text-xs text-muted-foreground">{conn.channelLabel}</span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          conn.status === "connected" && conn.hasWebhookUrl
                            ? "bg-green-500/10 text-green-700 dark:text-green-400"
                            : conn.status === "error"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {conn.status === "connected" && conn.hasWebhookUrl
                          ? "Connected"
                          : conn.status === "error"
                            ? "Delivery failing"
                            : conn.status}
                      </span>
                    </div>
                    {conn.status === "error" && (
                      <p className="mt-1 text-xs text-destructive">
                        Slack rejected recent posts — the webhook may have been revoked or
                        rotated. Edit this channel and paste a fresh incoming-webhook URL to
                        reconnect.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(conn.id)}
                      disabled={testingId === conn.id || !conn.hasWebhookUrl}
                    >
                      <Send className="size-3.5" />
                      {testingId === conn.id ? "Sending..." : "Test"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleEdit(conn)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(conn.id)}
                      aria-label="Delete connection"
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                {testResult[conn.id] && <p className="mt-2 text-xs">{testResult[conn.id]}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add / edit connection */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-sm">
            {editingId ? "Edit channel" : "Add a channel"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {saved && (
            <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">Saved.</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="slack-name">Name</Label>
              <Input
                id="slack-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sales team"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="slack-channel">Channel (label)</Label>
              <Input
                id="slack-channel"
                value={channelLabel}
                onChange={(e) => setChannelLabel(e.target.value)}
                placeholder="#sales"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="slack-url">Incoming webhook URL</Label>
            <Input
              id="slack-url"
              type="password"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder={
                editingId ? "•••••••• (leave blank to keep)" : "https://hooks.slack.com/services/…"
              }
              autoComplete="new-password"
            />
          </div>

          <div className="flex justify-end gap-2">
            {editingId && (
              <Button variant="ghost" onClick={resetForm} disabled={pending}>
                <X className="size-4" />
                Cancel
              </Button>
            )}
            <Button onClick={handleSave} disabled={pending || !name}>
              {editingId ? <Save className="size-4" /> : <Plus className="size-4" />}
              {pending ? "Saving..." : editingId ? "Save" : "Add channel"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Which events broadcast */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-sm">Broadcast these events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="mb-2 text-xs text-muted-foreground">
            Choose which events post to your connected channels. Nothing is sent until at least one
            channel above is connected.
          </p>
          {SLACK_EVENTS.map((ev) => (
            <div key={ev.value} className="flex items-center justify-between border-b py-2.5 last:border-0">
              <span className="text-sm">{ev.label}</span>
              <Switch
                checked={routing[ev.value] ?? false}
                onCheckedChange={(v: boolean) => toggleEvent(ev.value, v)}
                aria-label={`Broadcast ${ev.label} to Slack`}
              />
            </div>
          ))}
          {routingError && <p className="mt-2 text-sm text-destructive">{routingError}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
