import { requireUser } from "@/lib/security/auth"
import { getReportData } from "@/lib/data/reports"
import { ReportsView } from "@/components/reports/reports-view"

export const metadata = {
  title: "Reports - Nodwin CRM",
}

export default async function ReportsPage() {
  const user = await requireUser()
  const reportData = await getReportData({ user, source: "web" })

  return <ReportsView data={reportData} />
}
