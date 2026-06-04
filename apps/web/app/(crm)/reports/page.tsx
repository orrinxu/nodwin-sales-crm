import { requireUser } from "@/lib/security/auth"
import { getReportData } from "@/lib/data/reports"
import { ReportsView } from "@/components/reports/reports-view"

export const metadata = {
  title: "Reports - Nodwin CRM",
}

export default async function ReportsPage() {
  await requireUser()
  const reportData = await getReportData()

  return <ReportsView data={reportData} />
}
