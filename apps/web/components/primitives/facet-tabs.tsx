"use client"

import * as React from "react"
import { Lock } from "lucide-react"

import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

// Underline "facet" styling for a record-detail tab bar, layered on ui/tabs.
// Reverted from the segmented-pill treatment back to the underline (Orrin,
// 2026-07-12), with a larger 18px label for prominence; active = semibold +
// primary-tinted label with a primary underline.
const FACET_LIST_CLASS =
  "w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0"
const FACET_TAB_CLASS =
  // -mb-px pulls each tab's 2px underline down onto the list's border-b so the
  // active underline sits flush with the bar's rule (no doubled/offset hairline).
  "-mb-px rounded-none border-b-2 border-transparent px-0 py-2.5 text-[18px] font-medium text-muted-foreground transition-colors hover:text-foreground data-active:border-primary data-active:bg-transparent data-active:font-semibold data-active:text-primary data-active:shadow-none"

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
