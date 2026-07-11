import { cn } from "@/lib/utils"

export interface RecordHeaderStat {
  label: string
  value: React.ReactNode
  /** Small helper line under the value. */
  sub?: React.ReactNode
  /** Extra classes on the value span (e.g. a larger amount). */
  valueClassName?: string
  /** Extra classes on the cell (e.g. column spanning). */
  className?: string
}

/** One cell of the hairline stat strip: eyebrow label + value + optional sub-line. */
function StatCell({ label, value, sub, valueClassName, className }: RecordHeaderStat) {
  return (
    <div className={cn("flex flex-col gap-1 bg-card px-4 py-3", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </span>
      <span className={cn("text-[15px] font-semibold tracking-[-0.01em]", valueClassName)}>
        {value}
      </span>
      {sub ? <span className="text-[11.5px] text-muted-foreground">{sub}</span> : null}
    </div>
  )
}

/** Default grid template — tuned for a ~5-cell strip with a wider first (amount) cell. */
const DEFAULT_STATS_GRID =
  "grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]"

interface RecordHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Right-aligned header actions (buttons, menus). */
  actions?: React.ReactNode
  /** Cells of the hairline stat strip. Omit for no strip. */
  stats?: RecordHeaderStat[]
  /** Override the stat-strip grid container classes (column template). */
  statsGridClassName?: string
  className?: string
}

/**
 * Canonical record detail header: title + subtitle on the left, actions on the
 * right, and an optional hairline stat strip beneath. Shared across record
 * detail pages (opportunities now; accounts/contacts in Phase 4).
 */
export function RecordHeader({
  title,
  subtitle,
  actions,
  stats,
  statsGridClassName,
  className,
}: RecordHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[23px] font-bold leading-[1.15] tracking-[-0.02em]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-[12px] font-medium text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {stats && stats.length > 0 ? (
        <div className={statsGridClassName ?? DEFAULT_STATS_GRID}>
          {stats.map((stat, i) => (
            <StatCell key={`${stat.label}-${i}`} {...stat} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
