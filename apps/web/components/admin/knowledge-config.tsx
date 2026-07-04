"use client"

import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import {
  Eye,
  EyeOff,
  Loader2,
  Play,
  Save,
  Settings2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  updateAISettingsAction,
  getIngestionStatsAction,
} from "@/app/(crm)/admin/knowledge/actions"
import type { AISettings, IngestionStats } from "@/lib/data/knowledge-admin"

const formSchema = z.object({
  embeddingsEndpoint: z.string().max(500).optional(),
  embeddingsModel: z.string().max(200).optional(),
  embeddingsKey: z.string().max(500).optional(),
  generationEndpoint: z.string().max(500).optional(),
  generationModel: z.string().max(200).optional(),
  generationKey: z.string().max(500).optional(),
  ingestionEnabled: z.boolean(),
  searchEnabled: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

interface Props {
  settings: AISettings
  stats: IngestionStats
}

function StatCard({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant: "pending" | "indexed" | "failed"
}) {
  const colorClass =
    variant === "pending"
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : variant === "indexed"
        ? "bg-green-100 text-green-800 border-green-200"
        : "bg-red-100 text-red-800 border-red-200"

  return (
    <Card className={colorClass}>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs font-medium uppercase tracking-wider opacity-70">
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <span className="text-3xl font-bold">{value}</span>
      </CardContent>
    </Card>
  )
}

export function KnowledgeConfig({ settings, stats }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [showEmbeddingsKey, setShowEmbeddingsKey] = useState(false)
  const [showGenerationKey, setShowGenerationKey] = useState(false)
  const [lastStats, setLastStats] = useState(stats)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      embeddingsEndpoint: settings.embeddingsEndpoint,
      embeddingsModel: settings.embeddingsModel,
      embeddingsKey: "",
      generationEndpoint: settings.generationEndpoint,
      generationModel: settings.generationModel,
      generationKey: "",
      ingestionEnabled: settings.ingestionEnabled,
      searchEnabled: settings.searchEnabled,
    },
  })

  async function onSubmit(values: FormValues) {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        embeddingsEndpoint: values.embeddingsEndpoint || "",
        embeddingsModel: values.embeddingsModel || "",
        generationEndpoint: values.generationEndpoint || "",
        generationModel: values.generationModel || "",
        ingestionEnabled: values.ingestionEnabled,
        searchEnabled: values.searchEnabled,
      }
      if (values.embeddingsKey) {
        payload.embeddingsKey = values.embeddingsKey
      }
      if (values.generationKey) {
        payload.generationKey = values.generationKey
      }
      const result = await updateAISettingsAction(settings.id, payload)
      form.reset({
        embeddingsEndpoint: result.embeddingsEndpoint,
        embeddingsModel: result.embeddingsModel,
        embeddingsKey: "",
        generationEndpoint: result.generationEndpoint,
        generationModel: result.generationModel,
        generationKey: "",
        ingestionEnabled: result.ingestionEnabled,
        searchEnabled: result.searchEnabled,
      })
      router.refresh()
    } catch (e) {
      console.error("Failed to save settings:", e)
    } finally {
      setSaving(false)
    }
  }

  async function runIngestion() {
    setRunning(true)
    try {
      await fetch("/api/knowledge/ingest", { method: "POST" })
      const fresh = await getIngestionStatsAction()
      setLastStats(fresh)
      router.refresh()
    } catch (e) {
      console.error("Failed to run ingestion:", e)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Knowledge Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure AI models, embeddings, and manage the knowledge ingestion pipeline.
        </p>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-5" />
              Embeddings Configuration
            </CardTitle>
            <CardDescription>
              Configure the embeddings model used for semantic search and document chunking.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="embedding-endpoint">Endpoint URL</Label>
                <Input
                  id="embedding-endpoint"
                  placeholder="https://api.openai.com/v1/embeddings"
                  {...form.register("embeddingsEndpoint")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="embedding-model">Model</Label>
                <Input
                  id="embedding-model"
                  placeholder="text-embedding-3-small"
                  {...form.register("embeddingsModel")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="embedding-key">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="embedding-key"
                    type={showEmbeddingsKey ? "text" : "password"}
                    placeholder={
                      settings.embeddingsKey
                        ? settings.embeddingsKey
                        : "sk-..."
                    }
                    {...form.register("embeddingsKey")}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setShowEmbeddingsKey(!showEmbeddingsKey)
                  }
                  aria-label={
                    showEmbeddingsKey
                      ? "Hide API key"
                      : "Show API key"
                  }
                >
                  {showEmbeddingsKey ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank to keep the current key unchanged.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-5" />
              Generation Configuration
            </CardTitle>
            <CardDescription>
              Configure the LLM used for generating responses, drafts, and summaries.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="generation-endpoint">Endpoint URL</Label>
                <Input
                  id="generation-endpoint"
                  placeholder="https://api.openai.com/v1/chat/completions"
                  {...form.register("generationEndpoint")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="generation-model">Model</Label>
                <Input
                  id="generation-model"
                  placeholder="gpt-4o"
                  {...form.register("generationModel")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="generation-key">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="generation-key"
                    type={showGenerationKey ? "text" : "password"}
                    placeholder={
                      settings.generationKey
                        ? settings.generationKey
                        : "sk-..."
                    }
                    {...form.register("generationKey")}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setShowGenerationKey(!showGenerationKey)
                  }
                  aria-label={
                    showGenerationKey
                      ? "Hide API key"
                      : "Show API key"
                  }
                >
                  {showGenerationKey ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank to keep the current key unchanged.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feature Toggles</CardTitle>
            <CardDescription>
              Enable or disable knowledge features across the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="ingestion-enabled" className="text-sm font-medium">
                    Ingestion
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Allow document and data ingestion into the knowledge index.
                  </p>
                </div>
                <Controller
                  name="ingestionEnabled"
                  control={form.control}
                  render={({ field }) => (
                    <Switch
                      id="ingestion-enabled"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="search-enabled" className="text-sm font-medium">
                    Semantic Search
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enable AI-powered semantic search across indexed content.
                  </p>
                </div>
                <Controller
                  name="searchEnabled"
                  control={form.control}
                  render={({ field }) => (
                    <Switch
                      id="search-enabled"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save Settings
          </Button>
        </div>
      </form>

      <Separator />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Play className="size-5" />
                Ingestion Pipeline
              </CardTitle>
              <CardDescription>
                Monitor and manage the document ingestion pipeline.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={runIngestion}
              disabled={running}
            >
              {running ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              Run Ingestion Now
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Pending"
              value={lastStats.pending}
              variant="pending"
            />
            <StatCard
              label="Indexed"
              value={lastStats.indexed}
              variant="indexed"
            />
            <StatCard
              label="Failed"
              value={lastStats.failed}
              variant="failed"
            />
          </div>
          {lastStats.failed > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="destructive">
                {lastStats.failed} item
                {lastStats.failed !== 1 ? "s" : ""} failed
              </Badge>
              <span className="text-xs text-muted-foreground">
                Check server logs for details on failed ingestion jobs.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
