"use client"

import Link from "next/link"
import { PanelLeftClose, PanelLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

import { TooltipProvider } from "@/components/ui/tooltip"
import { NavMain, mainNavItems } from "./nav-main"

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  return (
    <TooltipProvider>
      <aside
        data-collapsed={collapsed}
        className={cn(
          "group/sidebar hidden flex-col gap-4 border-r border-sidebar-border bg-sidebar md:flex",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
          <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
              N
            </div>
            {!collapsed && (
              <span className="truncate text-sm font-semibold text-sidebar-foreground">
                Nodwin CRM
              </span>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleCollapse}
            className={cn(
              "ml-auto shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground",
              collapsed && "mx-auto",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
          <NavMain items={mainNavItems} collapsed={collapsed} />
        </div>

        <div className="border-t border-sidebar-border p-2">
          {!collapsed && (
            <p className="px-2 text-xs text-sidebar-foreground/40">
              Nodwin Sales CRM
            </p>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
