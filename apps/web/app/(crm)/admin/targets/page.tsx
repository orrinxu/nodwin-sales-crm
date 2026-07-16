import { requireUser, requireRole } from "@/lib/security/auth"
import { getTargetsForQuarter } from "@/lib/data/sales-targets"
import { quarterOf } from "@/lib/sales/quarter"
import { SalesTargetsForm } from "@/components/admin/sales-targets-form"
import { saveTargetsAction } from "./actions"

export default async function AdminTargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>
}) {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const now = quarterOf(new Date())
  const sp = await searchParams
  const year = Number(sp.year) || now.year
  const quarter = Math.min(4, Math.max(1, Number(sp.quarter) || now.quarter))

  const targets = await getTargetsForQuarter(ctx, year, quarter)
  const currency = targets.find((t) => t.amount)?.currency ?? "USD"

  return (
    <SalesTargetsForm
      key={`${year}-${quarter}`}
      year={year}
      quarter={quarter}
      currency={currency}
      targets={targets}
      saveAction={saveTargetsAction}
    />
  )
}
