import * as React from "react"

import { cn } from "@/lib/utils"

interface DefinitionItem {
  term: string
  description: React.ReactNode
}

interface DefinitionGridProps extends React.ComponentProps<"dl"> {
  items: DefinitionItem[]
}

export function DefinitionGrid({ items, className, ...props }: DefinitionGridProps) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
      {...props}
    >
      {items.map((item) => (
        <div key={item.term} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{item.term}</dt>
          <dd className="mt-0.5 text-sm break-words">{item.description}</dd>
        </div>
      ))}
    </dl>
  )
}
