"use client"

import { useState } from "react"
import { Cpu, CheckCircle2, AlertCircle, Server, Cloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import type { AiProviderName, AiProvidersView, AiProviderSafe } from "@/lib/data/ai-providers"

interface Props {
  data: AiProvidersView
  saveAction: (input: unknown) => Promise<void>
}

interface Draft {
  enabled: boolean
  baseUrl: string
  model: string
  apiKey: string // write-only; blank = keep
  priority: number
}

function toDraft(p: AiProviderSafe): Draft {
  return { enabled: p.enabled, baseUrl: p.baseUrl ?? "", model: p.model ?? "", apiKey: "", priority: p.priority }
}

const NONE = "__none__"

export function AiProvidersForm({ data, saveAction }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    () => Object.fromEntries(data.providers.map((p) => [p.provider, toDraft(p)])),
  )
  const [primary, setPrimary] = useState<string>(data.primaryProvider ?? NONE)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patch(provider: string, next: Partial<Draft>) {
    // eslint-disable-next-line security/detect-object-injection -- provider is a known AiProviderName from the rendered list, not user input
    setDrafts((d) => ({ ...d, [provider]: { ...d[provider], ...next } }))
    setSaved(false)
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setPending(true); setError(null); setSaved(false)
    try {
      await saveAction({
        providers: data.providers.map((p) => {
          const d = drafts[p.provider]
          return {
            provider: p.provider,
            enabled: d.enabled,
            baseUrl: d.baseUrl,
            model: d.model,
            priority: d.priority,
            ...(d.apiKey.length > 0 ? { apiKey: d.apiKey } : {}),
          }
        }),
        primaryProvider: primary === NONE ? null : (primary as AiProviderName),
      })
      setSaved(true)
      setDrafts((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { ...v, apiKey: "" }])))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setPending(false)
    }
  }

  // Only enabled providers are eligible to be the primary.
  const primaryOptions = data.providers.filter((p) => drafts[p.provider]?.enabled)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Cpu className="size-5 text-muted-foreground" /> AI providers
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which model providers the CRM uses for AI features (deal summaries, email drafts,
          next-best-action). The <strong>primary</strong> runs first; if it fails, the router falls
          back down the enabled providers by priority. Self-hosted providers need an endpoint
          (IP&nbsp;/&nbsp;port); values here override environment defaults.
        </p>
      </div>

      <form onSubmit={onSave} className="space-y-6">
        {/* Primary picker */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Primary provider</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Select value={primary} onValueChange={(v) => { setPrimary(v ?? NONE); setSaved(false) }}>
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="No primary — use priority order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No primary (use priority order)</SelectItem>
                {primaryOptions.map((p) => (
                  <SelectItem key={p.provider} value={p.provider}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {primary !== NONE && !primaryOptions.some((p) => p.provider === primary) && (
              <p className="text-xs text-destructive">
                The selected primary is not enabled — enable it below or it will be ignored.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Only enabled providers can be primary.</p>
          </CardContent>
        </Card>

        {/* Per-provider config */}
        <div className="space-y-4">
          {data.providers.map((p) => {
            const d = drafts[p.provider]
            return (
              <Card key={p.provider}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      {p.selfHosted ? <Server className="size-4 text-muted-foreground" /> : <Cloud className="size-4 text-muted-foreground" />}
                      {p.label}
                      {p.configured ? (
                        <Badge variant="default" className="gap-1 text-xs"><CheckCircle2 className="size-3" /> Configured</Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 text-xs"><AlertCircle className="size-3" /> Not configured</Badge>
                      )}
                    </span>
                    <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                      {d.enabled ? "Enabled" : "Disabled"}
                      <Switch checked={d.enabled} onCheckedChange={(v) => patch(p.provider, { enabled: v })} />
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label={p.selfHosted ? "Endpoint URL (IP / port)" : "Endpoint URL (optional override)"}
                    className={p.selfHosted ? "sm:col-span-2" : "sm:col-span-2"}
                  >
                    <Input
                      value={d.baseUrl}
                      onChange={(e) => patch(p.provider, { baseUrl: e.target.value })}
                      placeholder={p.selfHosted ? "http://192.168.88.51:8080/v1" : "(uses provider default)"}
                    />
                  </Field>
                  <Field label="Model">
                    <Input value={d.model} onChange={(e) => patch(p.provider, { model: e.target.value })} placeholder="model name" />
                  </Field>
                  <Field label="Priority (lower runs first)">
                    <Input
                      type="number" min={0} max={1000} value={d.priority}
                      onChange={(e) => patch(p.provider, { priority: Number(e.target.value) })}
                    />
                  </Field>
                  {!p.selfHosted && (
                    <Field label="API key" className="sm:col-span-2">
                      <Input
                        type="password" autoComplete="new-password"
                        value={d.apiKey}
                        onChange={(e) => patch(p.provider, { apiKey: e.target.value })}
                        placeholder={p.hasApiKey ? "•••••••• (leave blank to keep)" : "API key"}
                      />
                    </Field>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save providers"}</Button>
          {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
        </div>
      </form>
    </div>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
