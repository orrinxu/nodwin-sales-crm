import { requireUser } from "@/lib/security/auth"
import { getPipelineSummary } from "@/lib/data/reports"
import { ReportsContent } from "./reports-content"

export default async function ReportsPage() {
  const user = await requireUser()
  const pipeline = await getPipelineSummary({ user, source: "web" })

  return <ReportsContent pipeline={pipeline} />
}
