import { requireUser } from "@/lib/security/auth"
import { getReportData } from "@/lib/data/reports"
import { getForecastData } from "@/lib/data/forecast"
import { ReportsViewLazy } from "@/components/reports/reports-view.lazy"
import { ForecastScorecardsLazy } from "@/components/reports/forecast-scorecards.lazy"

export const metadata = {
  title: "Reports - Nodwin CRM",
}

export default async function ReportsPage() {
  const user = await requireUser()
  const ctx = { user, source: "web" as const }
  const [reportData, forecastData] = await Promise.all([
    getReportData(ctx),
    getForecastData(ctx),
  ])

  return (
    <div className="flex flex-col gap-6 p-6">
      <ForecastScorecardsLazy data={forecastData} />
      <ReportsViewLazy data={reportData} />
    </div>
  )
}
