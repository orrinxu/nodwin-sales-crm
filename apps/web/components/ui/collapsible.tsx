"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"

function Collapsible({
  open,
  defaultOpen,
  onOpenChange,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [isOpen, setIsOpen] = React.useState(open ?? defaultOpen ?? false)

  const controlled = open !== undefined
  const expanded = controlled ? open : isOpen

  const handleToggle = React.useCallback(() => {
    const next = !expanded
    if (!controlled) setIsOpen(next)
    onOpenChange?.(next)
  }, [expanded, controlled, onOpenChange])

  return (
    <div
      data-slot="collapsible"
      data-state={expanded ? "open" : "closed"}
      className={cn(className)}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement<{ "data-state"?: string; onClick?: unknown; "aria-expanded"?: boolean }>(child)) return child
        if (
          typeof child.type === "function" &&
          "displayName" in child.type &&
          (child.type.displayName === "CollapsibleTrigger" ||
            child.type.displayName === "CollapsibleContent")
        ) {
          return React.cloneElement(child, {
            "data-state": expanded ? "open" : "closed",
            onClick: child.type.displayName === "CollapsibleTrigger" ? handleToggle : child.props.onClick,
            "aria-expanded": child.type.displayName === "CollapsibleTrigger" ? expanded : undefined,
          })
        }
        return child
      })}
    </div>
  )
}

function CollapsibleTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="collapsible-trigger"
      role="button"
      tabIndex={0}
      className={cn(
        "flex items-center gap-1 cursor-pointer select-none rounded-md transition-colors hover:bg-muted/50 data-[state=open]:[&>svg]:rotate-90",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          ;(props as unknown as { onClick?: () => void }).onClick?.()
        }
      }}
      {...props}
    >
      <ChevronRight className="size-3.5 shrink-0 transition-transform duration-200" />
      {children}
    </div>
  )
}
CollapsibleTrigger.displayName = "CollapsibleTrigger"

function CollapsibleContent({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="collapsible-content"
      className={cn(
        "grid transition-all duration-200",
        "data-[state=closed]:grid-rows-[0fr] data-[state=open]:grid-rows-[1fr]",
        className,
      )}
      {...props}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}
CollapsibleContent.displayName = "CollapsibleContent"

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
