import { Check } from "lucide-react"

import { getStageLabel } from "@/lib/data/opportunities.types"
import { NON_TERMINAL_STAGES } from "@/lib/opportunity"
import type { DealStage } from "@/lib/opportunity"
import { cn } from "@/lib/utils"

/**
 * Interactive stage stepper for an opportunity's deal lifecycle. Each segment is
 * a button that moves the deal to that stage (kept interactive per convention
 * decision C1). The final "Closed" segment reflects the terminal won/lost state.
 */
export function StageTracker({
  stage,
  isTerminal,
  currentIndex,
  disabled,
  onSelect,
}: {
  stage: DealStage
  isTerminal: boolean
  currentIndex: number
  disabled: boolean
  onSelect: (s: DealStage) => void
}) {
  const closedWon = stage === "closed_won"
  return (
    <div className="flex items-stretch overflow-x-auto">
      {NON_TERMINAL_STAGES.map((s, i) => {
        const completed = !isTerminal && i < currentIndex
        const current = !isTerminal && stage === s
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            aria-current={current ? "step" : undefined}
            title={disabled ? undefined : `Set stage to ${getStageLabel(s)}`}
            onClick={() => onSelect(s)}
            className={cn(
              "group flex min-w-[72px] flex-1 flex-col items-center gap-1.5 rounded-md py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
              disabled ? "cursor-default" : "cursor-pointer hover:bg-muted/60",
            )}
          >
            <div className="flex w-full items-center">
              <span className={cn("h-[3px] flex-1 transition-colors motion-reduce:transition-none", i === 0 ? "invisible" : completed || current ? "bg-primary" : "bg-border")} />
              <span
                className={cn(
                  "relative z-10 flex size-5 items-center justify-center rounded-full text-[10px] transition-colors motion-reduce:transition-none",
                  completed && "bg-primary text-primary-foreground",
                  current && "border border-primary bg-background ring-4 ring-primary/20",
                  !completed && !current && "border border-border bg-background",
                )}
              >
                {completed ? <Check className="size-3" /> : current ? <span className="size-1.5 rounded-full bg-primary" /> : null}
              </span>
              <span className={cn("h-[3px] flex-1 transition-colors motion-reduce:transition-none", completed ? "bg-primary" : "bg-border")} />
            </div>
            <span className={cn("px-1 text-center text-[12px]", current ? "font-semibold text-primary" : completed ? "text-foreground" : "text-muted-foreground")}>
              {getStageLabel(s)}
            </span>
          </button>
        )
      })}
      {/* Closed terminal segment */}
      <div className="flex min-w-[72px] flex-1 flex-col items-center gap-1.5 py-1">
        <div className="flex w-full items-center">
          <span className={cn("h-[3px] flex-1", isTerminal ? "bg-primary" : "bg-border")} />
          <span
            className={cn(
              "relative z-10 flex size-5 items-center justify-center rounded-full",
              isTerminal ? (closedWon ? "bg-primary text-primary-foreground" : "bg-destructive text-white") : "border border-border bg-background",
            )}
          >
            {isTerminal ? <Check className="size-3" /> : null}
          </span>
          <span className="h-[3px] flex-1 invisible" />
        </div>
        <span className={cn("text-[12px]", isTerminal ? (closedWon ? "font-semibold text-primary" : "font-semibold text-destructive") : "text-muted-foreground")}>
          {isTerminal ? getStageLabel(stage) : "Closed"}
        </span>
      </div>
    </div>
  )
}
