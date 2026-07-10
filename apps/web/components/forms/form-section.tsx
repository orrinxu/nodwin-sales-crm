"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"

interface FormSectionProps {
  title: string
  description?: string
  /**
   * Fallback open state used for SSR and when no matchMedia is available (tests).
   * At runtime the section instead follows the viewport: expanded on desktop,
   * collapsed on mobile (see the mount effect). Ignored when collapsible=false.
   */
  defaultOpen?: boolean
  /** false renders a static, always-open section with a plain header. */
  collapsible?: boolean
  /** Right-aligned adornment in the header (e.g. a stage hint). */
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * A titled group of form fields, shared across every record editor so the edit
 * layout mirrors the read-only detail view's groupings. Collapsible sections
 * keep their fields MOUNTED when closed (Collapsible keepMounted), so validation
 * and react-hook-form registration are never lost by collapsing a section.
 */
export function FormSection({
  title,
  description,
  defaultOpen = true,
  collapsible = true,
  aside,
  children,
  className,
}: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  // Responsive default: on a roomy desktop every section is expanded; on a narrow
  // phone they collapse so the form isn't an endless scroll. Runs once on mount —
  // the user's manual toggles stick afterwards. jsdom/SSR (no matchMedia) keep the
  // `defaultOpen` fallback so tests and the first paint are deterministic.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(min-width: 768px)")
    const sync = () => setOpen(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  const heading = (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
      {title}
    </h3>
  )

  // Fields flow across a responsive grid: 1 column on mobile, 2 on tablet, 3 on
  // desktop. A field spans all columns with `col-span-full` (Name, multi-selects,
  // textareas). Section headers live outside the grid, so they always span full.
  const FIELD_GRID =
    "grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 xl:grid-cols-3"

  if (!collapsible) {
    return (
      <section className={cn("space-y-3", className)}>
        <div className="flex items-center justify-between border-b pb-1.5 pt-1">
          {heading}
          {aside}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        <div className={FIELD_GRID}>{children}</div>
      </section>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <div className="flex items-center justify-between gap-2 border-b pb-1.5 pt-1">
        <button
          type="button"
          className="group -mx-1.5 flex flex-1 items-center gap-2 cursor-pointer select-none rounded-md px-1.5 py-1 transition-colors hover:bg-muted"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-primary transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
          {heading}
        </button>
        {aside}
      </div>
      <CollapsibleContent>
        <div className={cn(FIELD_GRID, "pt-3 pb-0.5")}>
          {description && (
            <p className="col-span-full text-xs text-muted-foreground">{description}</p>
          )}
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
