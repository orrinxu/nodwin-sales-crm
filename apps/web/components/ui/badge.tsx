import * as React from "react"
import { cn } from "@/lib/utils"

type BadgeVariant = "default" | "secondary" | "outline" | "destructive"

interface BadgeProps extends React.ComponentProps<"span"> {
  variant?: BadgeVariant
}


function getBadgeVariant(variant: BadgeVariant): string {
  switch (variant) {
    case "default":
      return "border-transparent bg-primary text-primary-foreground shadow-xs"
    case "secondary":
      return "border-transparent bg-secondary text-secondary-foreground"
    case "outline":
      return "text-foreground"
    case "destructive":
      return "border-transparent bg-destructive text-destructive-foreground shadow-xs"
  }
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors select-none",
        getBadgeVariant(variant),
        className,
      )}
      {...props}
    />
  )
}

export { Badge, type BadgeVariant }
