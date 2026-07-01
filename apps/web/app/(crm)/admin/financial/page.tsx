import { requireUser, requireRole } from "@/lib/security/auth"
import { getAllCurrencies } from "@/lib/data/currencies"
import { getAllFxRates } from "@/lib/data/fx-rates"
import { getAllEntities } from "@/lib/data/entities"
import { Card } from "@/components/ui/card"
import { DollarSign, ArrowRightLeft, Building2, Calendar, ShieldCheck } from "lucide-react"

export default async function FinancialSettingsOverviewPage() {
  const user = await requireUser()
  requireRole(user, "admin")
  const ctx = { user, source: "web" as const }

  const [currencies, fxRates, entities] = await Promise.all([
    getAllCurrencies(),
    getAllFxRates(),
    getAllEntities(ctx),
  ])

  const activeCurrencies = currencies.filter((c) => c.active).length
  const now = new Date()
  const staleRates = fxRates.length > 0
    ? fxRates.filter((r) => new Date(r.effectiveDate) < new Date(now.getTime() - 7 * 86400000)).length
    : 0
  const entitiesWithFy = entities.filter((e) => e.fiscalYearStartMonth !== 1).length

  const stats = [
    {
      label: "Active Currencies",
      value: activeCurrencies,
      total: currencies.length,
      icon: DollarSign,
    },
    {
      label: "FX Rates",
      value: fxRates.length,
      extra: `${staleRates} stale`,
      icon: ArrowRightLeft,
    },
    {
      label: "Entities",
      value: entities.length,
      extra: `${entitiesWithFy} custom FY`,
      icon: Building2,
    },
    {
      label: "Admin Role",
      value: "Required",
      extra: "All settings",
      icon: ShieldCheck,
    },
  ]

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financial Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage currencies, exchange rates, reporting defaults, fiscal years, and approval thresholds.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  {stat.extra && (
                    <p className="text-xs text-muted-foreground">{stat.extra}</p>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Quick Links</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink
            href="/admin/financial/currencies"
            icon={DollarSign}
            title="Currencies"
            description="Manage currency codes, decimal scales, and active flags"
          />
          <QuickLink
            href="/admin/financial/fx-rates"
            icon={ArrowRightLeft}
            title="FX Rates"
            description="Add and manage exchange rates between currencies"
          />
          <QuickLink
            href="/admin/financial/reporting-currency"
            icon={Building2}
            title="Reporting Currency"
            description="Set global and per-entity reporting currency defaults"
          />
          <QuickLink
            href="/admin/financial/fiscal-year"
            icon={Calendar}
            title="Fiscal Year"
            description="Configure fiscal year start months per entity"
          />
          <QuickLink
            href="/admin/financial/approval-thresholds"
            icon={ShieldCheck}
            title="Approval Thresholds"
            description="Set deal value, discount, and confidentiality rules"
          />
        </div>
      </Card>
    </div>
  )
}

function QuickLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-accent"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <Icon className="size-4 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </a>
  )
}
