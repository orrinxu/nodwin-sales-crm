"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Copy, Check, KeyRound, Trash2, Loader2 } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import type { ApiTokenRecord } from "@/lib/data/api-tokens"

interface Props {
  tokens: ApiTokenRecord[]
  createAction: (input: unknown) => Promise<{ token: string; record: ApiTokenRecord }>
  revokeAction: (id: string) => Promise<void>
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function statusOf(t: ApiTokenRecord): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (t.revokedAt) return { label: "Revoked", variant: "destructive" }
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) return { label: "Expired", variant: "secondary" }
  return { label: "Active", variant: "default" }
}

/**
 * The token generate/reveal/list UI without page chrome, so it can be dropped
 * into the standalone `/settings/api-tokens` page (via `ApiTokensView`) or the
 * "Access tokens" tab of the unified settings page.
 */
export function ApiTokensPanel({ tokens, createAction, revokeAction }: Props) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function handleCreate() {
    setError(null)
    if (!name.trim()) {
      setError("Give the token a name so you can recognise it later.")
      return
    }
    try {
      const { token } = await createAction({ name: name.trim() })
      setNewToken(token)
      setName("")
      startTransition(() => router.refresh())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleCopy() {
    if (!newToken) return
    await navigator.clipboard.writeText(newToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleRevoke(id: string) {
    setError(null)
    try {
      await revokeAction(id)
      startTransition(() => router.refresh())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Personal access tokens let an external agent (NanoClaw, OpenClaw, a script) read the CRM
        <strong> as you</strong> — it only ever sees what you can see. Send it as
        <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer &lt;token&gt;</code>
        to <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/v1/…</code>.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* One-time token reveal */}
      {newToken && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-sm">Copy your new token now — it won&apos;t be shown again</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
                {newToken}
              </code>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Store it in your agent&apos;s config. If you lose it, revoke it and generate a new one.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Create */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Generate a token</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NanoClaw – Telegram"
                maxLength={100}
                onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
              />
            </div>
            <Button onClick={() => void handleCreate()} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Your tokens ({tokens.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tokens yet. Generate one above.</p>
          ) : (
            <div className="divide-y divide-border">
              {tokens.map((t) => {
                const status = statusOf(t)
                const revocable = !t.revokedAt
                return (
                  <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{t.name}</p>
                        <Badge variant={status.variant} className="text-[10.5px]">{status.label}</Badge>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{t.tokenPrefix}…</p>
                      <p className="text-xs text-muted-foreground">
                        Created {formatDate(t.createdAt)} · Last used {formatDate(t.lastUsedAt)}
                        {t.expiresAt && ` · Expires ${formatDate(t.expiresAt)}`}
                      </p>
                    </div>
                    {revocable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => void handleRevoke(t.id)}
                      >
                        <Trash2 className="size-4" /> Revoke
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Standalone `/settings/api-tokens` page: the panel with a page header. */
export function ApiTokensView({ tokens, createAction, revokeAction }: Props) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <KeyRound className="size-5" /> API tokens
        </h1>
      </div>
      <ApiTokensPanel tokens={tokens} createAction={createAction} revokeAction={revokeAction} />
    </div>
  )
}
