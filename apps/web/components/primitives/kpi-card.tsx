import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface KpiCardProps {
  label: string
  value: React.ReactNode
  /** Small helper line under the value. */
  hint?: string
  icon?: LucideIcon
  /** Optional trend/delta indicator. */
  delta?: {
    value: string
    direction: "up" | "down" | "neutral"
  }
  className?: string
}

const deltaColor: Record<"up" | "down" | "neutral", string> = {
  up: "text-success",
  down: "text-destructive",
  neutral: "text-muted-foreground",
}

/**
 * Compact metric tile for dashboards / report headers. Label + big value with
 * an optional icon, hint line, and directional delta.
 */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  delta,
  className,
}: KpiCardProps) {
  return (
    <Card className={className}>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-caption font-medium text-muted-foreground">
            {label}
          </p>
          <p className="text-title tabular-nums">{value}</p>
          {delta ? (
            <p
              className={cn(
                "text-caption font-medium",
                delta.direction === "up"
                  ? deltaColor.up
                  : delta.direction === "down"
                    ? deltaColor.down
                    : deltaColor.neutral,
              )}
            >
              {delta.value}
            </p>
          ) : null}
          {hint ? (
            <p className="text-caption text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
        ) : null}
      </CardContent>
    </Card>
  )
}
