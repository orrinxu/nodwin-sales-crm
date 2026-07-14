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
import { modelsFor } from "@/lib/ai/provider-models"
import { AI_FEATURE_NAMES } from "@/lib/ai/features"
import type { FeatureProviderOverrides } from "@/lib/ai/features"
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
const AUTO = "__auto__"

// ORR-685: the override seam (ai_settings.feature_provider_overrides) is still a
// per-feature map, but the UI is now a single control. Collapse the stored map to
// one value: a provider iff every feature pins the same one, else Auto (this also
// normalises any legacy mixed per-feature config on the next save).
function deriveGlobalOverride(map: Record<string, string>): string {
  const values = Object.values(map)
  if (values.length === 0) return AUTO
  const first = values[0]
  return values.every((v) => v === first) ? first : AUTO
}

export function AiProvidersForm({ data, saveAction }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    () => Object.fromEntries(data.providers.map((p) => [p.provider, toDraft(p)])),
  )
  const [primary, setPrimary] = useState<string>(data.primaryProvider ?? NONE)
  // ORR-685: a single provider override applied to every AI feature (or Auto).
  const [globalOverride, setGlobalOverride] = useState<string>(
    () => deriveGlobalOverride(data.featureProviderOverrides ?? {}),
  )
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patch(provider: string, next: Partial<Draft>) {
    // eslint-disable-next-line security/detect-object-injection -- provider is a known AiProviderName from the rendered list, not user input
    setDrafts((d) => ({ ...d, [provider]: { ...d[provider], ...next } }))
    setSaved(false)
  }

  // Fan the single override out to every feature (or clear all for Auto), keeping
  // the stored map shape the resolver already consumes per feature.
  const featureProviderOverrides: FeatureProviderOverrides =
    globalOverride === AUTO
      ? {}
      : (Object.fromEntries(
          AI_FEATURE_NAMES.map((feature) => [feature, globalOverride as AiProviderName]),
        ) as FeatureProviderOverrides)

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
        featureProviderOverrides,
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
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
          These settings configure the general AI router and take effect for each generative AI
          feature as it is switched on. Knowledge search &amp; RAG answers use the dedicated
          self-hosted generation endpoint configured below — not this chain.
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

        {/* AI provider override (ORR-685) — one control forces all features onto a provider */}
        <Card>
          <CardHeader><CardTitle className="text-sm">AI provider override</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Force every AI feature onto one provider. <strong>Auto</strong> follows the
              primary&nbsp;/&nbsp;priority order above; picking a provider runs it first for all
              features, with the rest of the chain kept as fallback.
            </p>
            <Select value={globalOverride} onValueChange={(v) => { setGlobalOverride(v ?? AUTO); setSaved(false) }}>
              <SelectTrigger className="max-w-sm" aria-label="AI provider override">
                <SelectValue placeholder="Auto (follow priority order)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO}>Auto (follow priority order)</SelectItem>
                {primaryOptions.map((p) => (
                  <SelectItem key={p.provider} value={p.provider}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only enabled providers can be pinned. A pinned provider that later becomes unavailable
              is skipped — features fall back to the normal chain.
            </p>
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
                    <ModelPicker
                      provider={p.provider}
                      label={p.label}
                      value={d.model}
                      onChange={(v) => patch(p.provider, { model: v })}
                    />
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

/**
 * Model field: a datalist-backed combobox. For providers with a curated model
 * list, the models appear as selectable suggestions (native <datalist>), while
 * the field stays a plain text input so any custom / unknown value can still be
 * typed and is preserved on save. For providers with no curated list
 * (self-hosted), it degrades to a plain free-text input.
 */
function ModelPicker({
  provider, label, value, onChange,
}: {
  provider: AiProviderName
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const options = modelsFor(provider)
  const listId = `ai-model-options-${provider}`
  return (
    <>
      <Input
        aria-label={`Model for ${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={options.length > 0 ? "Select or type a model" : "model name"}
        list={options.length > 0 ? listId : undefined}
        autoComplete="off"
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      )}
    </>
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
