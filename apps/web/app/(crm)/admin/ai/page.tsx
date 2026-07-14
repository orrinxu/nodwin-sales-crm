import { requireUser, requireRole } from "@/lib/security/auth"
import { getAiProviders } from "@/lib/data/ai-providers"
import {
  getAiSettings,
  getIngestionStatusCounts,
  getFailedIngestionDocuments,
  getSkippedIngestionDocuments,
} from "@/lib/data/ai-settings"
import { Separator } from "@/components/ui/separator"
import { AiProvidersForm } from "@/components/admin/ai-providers-form"
import { AiSettingsForm } from "@/components/admin/ai-settings-form"
import { saveAiProvidersAction, saveAiSettingsAction, runIngestionNowAction, retryAllFailedAction } from "./actions"

export const metadata = {
  title: "AI - Nodwin CRM",
}

export default async function AdminAiPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [providers, settings, counts, failedDocuments, skippedDocuments] = await Promise.all([
    getAiProviders(ctx),
    getAiSettings(ctx),
    getIngestionStatusCounts(ctx),
    getFailedIngestionDocuments(ctx),
    getSkippedIngestionDocuments(ctx),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select AI providers and wire self-hosted endpoints (IP&nbsp;/&nbsp;port), then configure
          the knowledge&nbsp;/&nbsp;RAG endpoints used for document ingestion and search.
        </p>
      </div>

      <div className="max-w-3xl space-y-8">
        <AiProvidersForm data={providers} saveAction={saveAiProvidersAction} />

        <Separator />

        <AiSettingsForm
          settings={settings}
          counts={counts}
          failedDocuments={failedDocuments}
          skippedDocuments={skippedDocuments}
          saveAction={saveAiSettingsAction}
          runIngestionAction={runIngestionNowAction}
          retryFailedAction={retryAllFailedAction}
        />
      </div>
    </div>
  )
}
