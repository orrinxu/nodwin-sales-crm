import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface TagBadgeProps {
  children: React.ReactNode
  onRemove?: () => void
  className?: string
}

/**
 * Neutral, low-emphasis tag/label pill (categories, free-form tags). Optional
 * remove affordance for filter/selection contexts.
 */
export function TagBadge({ children, onRemove, className }: TagBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn("gap-1 font-normal", className)}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-0.5 ml-0.5 inline-flex size-3.5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          aria-label="Remove"
        >
          <span aria-hidden className="text-[0.7rem] leading-none">
            ×
          </span>
        </button>
      ) : null}
    </Badge>
  )
}
