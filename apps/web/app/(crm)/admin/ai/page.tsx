import { Sparkles } from "lucide-react"
import { requireUser, requireRole } from "@/lib/security/auth"
import { getAiProviders } from "@/lib/data/ai-providers"
import { getAiSettings, getIngestionStatusCounts } from "@/lib/data/ai-settings"
import { Separator } from "@/components/ui/separator"
import { AiProvidersForm } from "@/components/admin/ai-providers-form"
import { AiSettingsForm } from "@/components/admin/ai-settings-form"
import { saveAiProvidersAction, saveAiSettingsAction, runIngestionNowAction } from "./actions"

export const metadata = {
  title: "AI - Nodwin CRM",
}

export default async function AdminAiPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [providers, settings, counts] = await Promise.all([
    getAiProviders(ctx),
    getAiSettings(ctx),
    getIngestionStatusCounts(ctx),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Sparkles className="size-5 text-muted-foreground" /> AI configuration
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select AI providers and wire self-hosted endpoints (IP&nbsp;/&nbsp;port), then configure
          the knowledge&nbsp;/&nbsp;RAG endpoints used for document ingestion and search.
        </p>
      </div>

      <AiProvidersForm data={providers} saveAction={saveAiProvidersAction} />

      <Separator />

      <AiSettingsForm
        settings={settings}
        counts={counts}
        saveAction={saveAiSettingsAction}
        runIngestionAction={runIngestionNowAction}
      />
    </div>
  )
}
