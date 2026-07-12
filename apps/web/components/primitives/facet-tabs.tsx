"use client"

import * as React from "react"
import { Lock } from "lucide-react"

import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

// Segmented "facet" styling for a record-detail tab bar, layered on ui/tabs.
// Active tab reads as a filled primary-tint pill (Orrin, 2026-07-12 — chosen over
// the mock's underline for stronger at-a-glance "where am I" prominence).
const FACET_LIST_CLASS =
  "w-full flex-wrap justify-start gap-1.5 rounded-none border-b border-border bg-transparent p-0 pb-2"
const FACET_TAB_CLASS =
  "rounded-lg px-3.5 py-2 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-active:bg-primary/10 data-active:font-semibold data-active:text-primary data-active:shadow-none"

/** Facet tab group root — same behaviour as ui `Tabs`, re-exported for one-import ergonomics. */
export const FacetTabs = Tabs

/** Facet tab panel — same as ui `TabsPanel`. */
export const FacetTabsPanel = TabsPanel

/** Tab bar with the underline facet treatment. */
export function FacetTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsList>) {
  return <TabsList className={cn(FACET_LIST_CLASS, className)} {...props} />
}

/**
 * A single facet tab. `locked` appends a lock glyph (for gated tabs such as the
 * Cash Plan tab that stays selectable but shows a locked panel).
 */
export function FacetTabsTab({
  className,
  locked,
  children,
  ...props
}: React.ComponentProps<typeof TabsTab> & { locked?: boolean }) {
  return (
    <TabsTab className={cn(FACET_TAB_CLASS, className)} {...props}>
      {children}
      {locked ? <Lock className="size-3 text-muted-foreground" aria-hidden /> : null}
    </TabsTab>
  )
}
