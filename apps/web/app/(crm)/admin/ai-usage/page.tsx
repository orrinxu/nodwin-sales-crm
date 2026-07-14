import { requireUser, requireRole } from "@/lib/security/auth"
import { getAiUsageOverview } from "@/lib/data/ai-usage"
import { AiUsageDashboard } from "@/components/admin/ai-usage-dashboard"
import { loadAiUsageAction } from "./actions"

export default async function AdminAiUsagePage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const overview = await getAiUsageOverview({ user, source: "web" }, { days: 30 })

  return <AiUsageDashboard initial={overview} loadAction={loadAiUsageAction} />
}
