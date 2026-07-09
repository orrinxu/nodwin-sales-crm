"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"

interface FormSectionProps {
  title: string
  description?: string
  /** Collapsible sections start open when true. Ignored when collapsible=false. */
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

  const heading = (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </h3>
  )

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
        <div className="space-y-3">{children}</div>
      </section>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <div className="flex items-center justify-between gap-2 border-b pb-1.5 pt-1">
        <button
          type="button"
          className="group flex flex-1 items-center gap-2 cursor-pointer select-none rounded-md transition-colors hover:text-foreground"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
          {heading}
        </button>
        {aside}
      </div>
      <CollapsibleContent>
        <div className="space-y-3 pt-3 pb-0.5">
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Responsive two-column grid for pairing related fields inside a section. */
export function FieldGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)}>
      {children}
    </div>
  )
}
