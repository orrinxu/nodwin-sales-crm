import { requireUser, requireRole } from "@/lib/security/auth"
import { getOrCreateAISettings, maskSettingsForDisplay, getIngestionStats } from "@/lib/data/knowledge-admin"
import { KnowledgeConfig } from "@/components/admin/knowledge-config"

export default async function AdminKnowledgePage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [settings, stats] = await Promise.all([
    getOrCreateAISettings(ctx),
    getIngestionStats(ctx),
  ])

  return (
    <KnowledgeConfig
      settings={maskSettingsForDisplay(settings)}
      stats={stats}
    />
  )
}
