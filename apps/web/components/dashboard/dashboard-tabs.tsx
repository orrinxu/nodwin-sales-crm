"use client"

import { useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The dashboard scope switcher — My focus / Team / Group (SOW §17's three-tier
 * split). Holds the active-tab state and shows the matching pre-rendered panel.
 *
 * The three panels arrive already rendered on the server (passed as props), so
 * this client component only toggles which one is mounted. My focus is the
 * single-rep hub; Team and Group are the cross-rep / management scopes.
 */

const TABS = [
  { id: "my", label: "My focus" },
  { id: "team", label: "Team" },
  { id: "group", label: "Group" },
] as const

type TabId = (typeof TABS)[number]["id"]

interface DashboardTabsProps {
  myFocus: ReactNode
  team: ReactNode
  group: ReactNode
}

export function DashboardTabs({ myFocus, team, group }: DashboardTabsProps) {
  const [tab, setTab] = useState<TabId>("my")

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Your focus, your team, and the wider group
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Dashboard scope"
          className="inline-flex rounded-lg border border-border bg-muted p-0.5"
        >
          {TABS.map((t) => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>{tab === "my" ? myFocus : tab === "team" ? team : group}</div>
    </div>
  )
}
