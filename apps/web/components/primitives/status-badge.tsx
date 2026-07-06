import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type StatusTone =
  | "success"
  | "warning"
  | "info"
  | "destructive"
  | "neutral"

interface StatusBadgeProps {
  tone: StatusTone
  children: React.ReactNode
  className?: string
}

// Subtle tinted pills wired to the FIXED semantic tokens. Using the token
// utilities with an opacity modifier keeps one hue for bg + text.
const toneClasses: Record<StatusTone, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/12 text-info",
  destructive: "bg-destructive/12 text-destructive",
  neutral: "bg-muted text-muted-foreground",
}

/**
 * Semantic status pill (health, active/inactive, generic outcomes). For deal
 * pipeline stages use <StageBadge> instead.
 */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        // tone is a typed StatusTone key, so the lookup is safe.
        // eslint-disable-next-line security/detect-object-injection
        toneClasses[tone],
        className,
      )}
      data-tone={tone}
    >
      {children}
    </Badge>
  )
}
