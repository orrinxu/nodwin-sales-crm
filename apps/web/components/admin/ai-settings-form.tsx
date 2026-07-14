"use client"

import { useState } from "react"
import { Sparkles, Play, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { AiSettingsSafe, IngestionStatusCounts, FailedIngestionDocument } from "@/lib/data/ai-settings"
import type { RunIngestionResult } from "@/app/(crm)/admin/ai/actions"

interface Props {
  settings: AiSettingsSafe
  counts: IngestionStatusCounts
  failedDocuments?: FailedIngestionDocument[]
  saveAction: (input: unknown) => Promise<void>
  runIngestionAction: () => Promise<RunIngestionResult>
}

function ConfiguredBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <Badge variant="default" className="gap-1 text-xs"><CheckCircle2 className="size-3" /> Configured</Badge>
  ) : (
    <Badge variant="secondary" className="gap-1 text-xs"><AlertCircle className="size-3" /> Not configured</Badge>
  )
}

export function AiSettingsForm({ settings, counts, failedDocuments = [], saveAction, runIngestionAction }: Props) {
  const [embeddingsBaseUrl, setEmbeddingsBaseUrl] = useState(settings.embeddingsBaseUrl ?? "")
  const [embeddingsModel, setEmbeddingsModel] = useState(settings.embeddingsModel ?? "")
  const [embeddingsApiKey, setEmbeddingsApiKey] = useState("")
  const [generationBaseUrl, setGenerationBaseUrl] = useState(settings.generationBaseUrl ?? "")
  const [generationModel, setGenerationModel] = useState(settings.generationModel ?? "")
  const [generationApiKey, setGenerationApiKey] = useState("")
  const [ingestionEnabled, setIngestionEnabled] = useState(settings.ingestionEnabled)
  const [searchEnabled, setSearchEnabled] = useState(settings.searchEnabled)

  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<RunIngestionResult | null>(null)

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setPending(true); setError(null); setSaved(false)
    try {
      await saveAction({
        embeddingsBaseUrl, embeddingsModel, embeddingsApiKey,
        generationBaseUrl, generationModel, generationApiKey,
        ingestionEnabled, searchEnabled,
      })
      setSaved(true)
      setEmbeddingsApiKey(""); setGenerationApiKey("") // clear write-only fields
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setPending(false)
    }
  }

  async function onRun() {
    setRunning(true); setRunResult(null); setError(null)
    try {
      setRunResult(await runIngestionAction())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run ingestion")
    } finally {
      setRunning(false)
    }
  }

  const keyPlaceholder = (has: boolean) => (has ? "•••••••• (leave blank to keep)" : "API key (optional)")

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-5 text-muted-foreground" /> Knowledge &amp; RAG
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the self-hosted embedding and generation endpoints for document ingestion and
          knowledge search. Values set here override environment defaults.
        </p>
      </div>

      <form onSubmit={onSave} className="space-y-6">
        {/* Embeddings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span>Embeddings endpoint</span>
              <ConfiguredBadge ok={settings.embeddingsConfigured} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              OpenAI-compatible <code>/embeddings</code> server (e.g. llama.cpp with <code>--embedding</code>).
              The same model must index and query — changing it requires re-indexing.
            </p>
            <Field label="Base URL">
              <Input value={embeddingsBaseUrl} onChange={(e) => setEmbeddingsBaseUrl(e.target.value)} placeholder="http://host:8080/v1" />
            </Field>
            <Field label="Model">
              <Input value={embeddingsModel} onChange={(e) => setEmbeddingsModel(e.target.value)} placeholder="nomic-embed-text" />
            </Field>
            <Field label="API key">
              <Input type="password" value={embeddingsApiKey} onChange={(e) => setEmbeddingsApiKey(e.target.value)} placeholder={keyPlaceholder(settings.hasEmbeddingsApiKey)} autoComplete="new-password" />
            </Field>
          </CardContent>
        </Card>

        {/* Generation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span>Generation endpoint (RAG answers)</span>
              <ConfiguredBadge ok={settings.generationConfigured} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Self-hosted OpenAI-compatible chat server for grounded answers. Kept self-hosted so
              sensitive proposal/pricing text never leaves your infrastructure.
            </p>
            <Field label="Base URL">
              <Input value={generationBaseUrl} onChange={(e) => setGenerationBaseUrl(e.target.value)} placeholder="http://host:8081/v1" />
            </Field>
            <Field label="Model">
              <Input value={generationModel} onChange={(e) => setGenerationModel(e.target.value)} placeholder="qwen2.5-instruct" />
            </Field>
            <Field label="API key">
              <Input type="password" value={generationApiKey} onChange={(e) => setGenerationApiKey(e.target.value)} placeholder={keyPlaceholder(settings.hasGenerationApiKey)} autoComplete="new-password" />
            </Field>
          </CardContent>
        </Card>

        {/* Toggles */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Features</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Toggle label="Document ingestion enabled" checked={ingestionEnabled} onChange={setIngestionEnabled} />
            <Toggle label="Knowledge search enabled" checked={searchEnabled} onChange={setSearchEnabled} />
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
          {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
        </div>
      </form>

      {/* Ops panel */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Ingestion status</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <Stat label="Pending" value={counts.pending} />
            <Stat label="Indexed" value={counts.indexed} />
            <Stat label="Failed" value={counts.failed} />
            <Stat label="Total" value={counts.total} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={onRun} disabled={running}>
              <Play className="size-4" /> {running ? "Running…" : "Run ingestion now"}
            </Button>
            {runResult && (
              <span className="text-xs text-muted-foreground">
                {runResult.note ?? `Processed ${runResult.processed} — ${runResult.indexed} indexed, ${runResult.failed} failed, ${runResult.skipped} skipped.`}
              </span>
            )}
          </div>

          {counts.failed > 0 && <FailedDocuments docs={failedDocuments} total={counts.failed} />}
        </CardContent>
      </Card>
    </div>
  )
}

/** Diagnostic list of the most recent failed ingestions with their stored reason,
 *  so a "Failed" count is actionable instead of opaque. Collapsed by default. */
function FailedDocuments({ docs, total }: { docs: FailedIngestionDocument[]; total: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-destructive"
        aria-expanded={open}
      >
        <AlertCircle className="size-4 shrink-0" />
        {open ? "Hide" : "Show"} failure {total === 1 ? "reason" : "reasons"} ({total})
      </button>
      {open && (
        <ul className="divide-y divide-destructive/15 border-t border-destructive/20">
          {docs.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">No details available.</li>
          ) : (
            docs.map((d) => (
              <li key={d.id} className="space-y-1 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium" title={d.name}>{d.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {d.attempts} {d.attempts === 1 ? "attempt" : "attempts"}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words font-mono text-xs text-destructive">
                  {d.error?.trim() || "No error message was recorded."}
                </p>
              </li>
            ))
          )}
          {total > docs.length && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Showing the {docs.length} most recent of {total} failed documents.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4" />
      {label}
    </label>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
