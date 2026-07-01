"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/admin/financial", label: "Overview" },
  { href: "/admin/financial/currencies", label: "Currencies" },
  { href: "/admin/financial/fx-rates", label: "FX Rates" },
  { href: "/admin/financial/reporting-currency", label: "Reporting Currency" },
  { href: "/admin/financial/fiscal-year", label: "Fiscal Year" },
  { href: "/admin/financial/approval-thresholds", label: "Approval Thresholds" },
]

export function FinancialSettingsNav() {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-1 border-b border-border px-6">
      {tabs.map((tab) => {
        const isActive = tab.href === "/admin/financial"
          ? pathname === "/admin/financial"
          : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
