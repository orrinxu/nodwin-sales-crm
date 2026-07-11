import { Plus } from "lucide-react"

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

function isEmpty(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0)
}

/** How a field renders when it has no value: prompt to add, hide the row, or show a dash. */
export type EmptyFieldMode = "add" | "hide" | "dash"

interface DefinitionFieldProps {
  label: string
  /** Value used for emptiness detection when `children` is not provided. */
  value?: unknown
  children?: React.ReactNode
  /** Empty-state affordance. `add` renders a "+ Add" button when `onAdd` is set. */
  emptyMode?: EmptyFieldMode
  onAdd?: () => void
}

/**
 * A single label/value field: label over value, hairline row, with an empty
 * state that can prompt to add, hide, or show a dash. Canonical read-only field
 * used inside {@link DefinitionFieldGrid}.
 */
export function DefinitionField({
  label,
  value,
  children,
  emptyMode = "add",
  onAdd,
}: DefinitionFieldProps) {
  const empty = children === undefined ? isEmpty(value) : isEmpty(children)
  if (empty && emptyMode === "hide") return null
  return (
    <div className="flex flex-col gap-[3px] border-b border-border py-[11px] last:border-b-0">
      <dt className="text-[11.5px] font-medium text-muted-foreground">{label}</dt>
      <dd>
        {empty ? (
          emptyMode === "add" && onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1 rounded text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <Plus className="size-3" /> Add
            </button>
          ) : (
            <span className="text-[13.5px] text-muted-foreground">{"—"}</span>
          )
        ) : (
          <span className="text-[13.5px] font-medium leading-[1.6]">
            {children ?? (value as React.ReactNode)}
          </span>
        )}
      </dd>
    </div>
  )
}

/** Two-column `<dl>` grid wrapping {@link DefinitionField} rows. */
export function DefinitionFieldGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-10 sm:grid-cols-2", className)}>
      {children}
    </dl>
  )
}
