import type { ReactNode } from "react"

/**
 * A labelled band on the dashboard — an eyebrow heading with a hairline rule,
 * then its content. Used to give the "My focus" hub its action-first structure
 * (Needs your attention → My numbers → My pipeline → Recent).
 */
export function DashboardSection({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </h2>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      {children}
    </section>
  )
}
