import { cn } from "@/lib/utils"

export interface DefinitionItem {
  label: string
  value: React.ReactNode
}

interface DefinitionGridProps {
  items: DefinitionItem[]
  /** Number of columns at the md breakpoint. */
  columns?: 1 | 2 | 3
  className?: string
}

const columnClass: Record<1 | 2 | 3, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
}

/**
 * Label/value pairs laid out as a responsive grid — for detail panels and
 * record summaries. Renders semantic <dl>/<dt>/<dd>.
 */
export function DefinitionGrid({
  items,
  columns = 2,
  className,
}: DefinitionGridProps) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-6 gap-y-4",
        columns === 1
          ? columnClass[1]
          : columns === 3
            ? columnClass[3]
            : columnClass[2],
        className,
      )}
    >
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="min-w-0 space-y-0.5">
          <dt className="text-caption font-medium text-muted-foreground">
            {item.label}
          </dt>
          <dd className="text-body">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
