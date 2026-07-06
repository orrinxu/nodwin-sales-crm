import { cn } from "@/lib/utils"

interface SectionHeaderProps {
  title: string
  description?: string
  /** Optional eyebrow/overline label rendered above the title. */
  eyebrow?: string
  /** Right-aligned actions (buttons, toggles). */
  actions?: React.ReactNode
  className?: string
}

/**
 * Standard page / section header: title + optional description on the left,
 * actions on the right. Uses the type-scale utilities for consistent sizing.
 */
export function SectionHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="text-title">{title}</h1>
        {description ? (
          <p className="text-body text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
