import * as React from "react"
import { TrendingUpIcon, TrendingDownIcon, MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

interface KpiCardProps {
  /** Label shown above the value */
  label: string
  /** The primary numeric or text value */
  value: React.ReactNode
  /** Optional supporting text (e.g. "vs. last month") */
  description?: React.ReactNode
  /** Trend: positive, negative, or neutral */
  trend?: "up" | "down" | "flat"
  /** Trend delta text (e.g. "+12.5%") */
  delta?: string
  /** Optional icon */
  icon?: React.ReactNode
  className?: string
}

const trendIcons: Record<"up" | "down" | "flat", React.ComponentType<{ className?: string }>> = {
  up: TrendingUpIcon,
  down: TrendingDownIcon,
  flat: MinusIcon,
}

const trendColors: Record<"up" | "down" | "flat", string> = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-muted-foreground",
}

export function KpiCard({
  label,
  value,
  description,
  trend,
  delta,
  icon,
  className,
}: KpiCardProps) {
  const TrendIcon = trend ? trendIcons[trend] : null
  const trendColor = trend ? trendColors[trend] : ""

  return (
    <Card size="sm" className={cn("min-w-[160px]", className)}>
      <CardContent className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="mt-0.5 text-lg font-semibold leading-tight tabular-nums truncate">
            {value}
          </p>
          {(description || delta) ? (
            <div className="mt-1 flex items-center gap-1">
              {TrendIcon ? (
                <TrendIcon className={cn("size-3 shrink-0", trendColor)} />
              ) : null}
              {delta ? (
                <span className={cn("text-xs font-medium", trendColor)}>
                  {delta}
                </span>
              ) : null}
              {description ? (
                <span className="text-xs text-muted-foreground truncate">
                  {description}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {icon ? (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
