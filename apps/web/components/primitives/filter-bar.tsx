import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface FilterBarProps {
  children: React.ReactNode
  className?: string
}

/**
 * Row container for labelled filter controls. Pairs with <FilterField> so every
 * control has a visible label instead of an unlabeled placeholder row.
 */
export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      {children}
    </div>
  )
}

interface FilterFieldProps {
  label: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}

/** A single labelled control within a <FilterBar>. */
export function FilterField({
  label,
  htmlFor,
  children,
  className,
}: FilterFieldProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-caption text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
