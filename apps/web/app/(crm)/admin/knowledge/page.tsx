import { requireUser, requireRole } from "@/lib/security/auth"
import { getAiSettings, getIngestionStatusCounts } from "@/lib/data/ai-settings"
import { AiSettingsForm } from "@/components/admin/ai-settings-form"
import { saveAiSettingsAction, runIngestionNowAction } from "./actions"

export const metadata = {
  title: "Knowledge / AI - Nodwin CRM",
}

export default async function AdminKnowledgePage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [settings, counts] = await Promise.all([
    getAiSettings(ctx),
    getIngestionStatusCounts(ctx),
  ])

  return (
    <AiSettingsForm
      settings={settings}
      counts={counts}
      saveAction={saveAiSettingsAction}
      runIngestionAction={runIngestionNowAction}
    />
  )
}
