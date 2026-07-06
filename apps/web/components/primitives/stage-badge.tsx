import type { CSSProperties } from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getStageLabel } from "@/lib/data/opportunities.types"
import type { DealStage } from "@/lib/opportunity/stage"
import { STAGE } from "@/lib/theme/stage"

interface StageBadgeProps {
  stage: DealStage
  /** Override the default human label from getStageLabel(stage). */
  label?: string
  className?: string
}

/**
 * Pipeline-stage pill. A THIN wrapper over the base <Badge> (variant="outline")
 * that feeds the {@link STAGE} colours via inline custom properties — the base
 * badge cva is intentionally left untouched. Colours resolve to the fixed
 * 7-stage ramp in globals.css, so a stage looks identical everywhere.
 */
export function StageBadge({ stage, label, className }: StageBadgeProps) {
  // stage is a typed DealStage key, so the lookup is safe.
  // eslint-disable-next-line security/detect-object-injection
  const colors = STAGE[stage]
  const style = {
    backgroundColor: colors.badgeBg,
    color: colors.badgeFg,
    borderColor: "transparent",
  } satisfies CSSProperties

  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", className)}
      style={style}
      data-stage={stage}
    >
      {label ?? getStageLabel(stage)}
    </Badge>
  )
}
