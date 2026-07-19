"use client"

import { Filter } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmptyState } from "@/components/primitives/empty-state"
import { stageChartColor } from "@/components/primitives/chart-theme"
import type { ConversionFunnelData } from "@/lib/opportunity/conversion-funnel"

interface ConversionFunnelProps {
  data: ConversionFunnelData
  /** Intl locale for digit grouping (thousands vs lakh/crore). */
  locale: string
}

/**
 * Conversion-by-Stage funnel (SOW §17). Each row is a stage; the bar width is
 * that stage's share of the top of the funnel, so the bars narrow downward and
 * read as a funnel. The right column shows both the share of total and the
 * step-over-step conversion from the stage above. All figures are computed in
 * the pure {@link ConversionFunnelData} builder; this component only formats.
 *
 * Counts sit on the card background (never inside the coloured bars) so contrast
 * holds in light and dark themes regardless of stage colour.
 */
export function ConversionFunnel({ data, locale }: ConversionFunnelProps) {
  const nf = new Intl.NumberFormat(locale)
  // Empty only when NOTHING entered — an all-lost funnel (topCount 0, lost > 0)
  // still has deals to report honestly (ORR-813), so it is not "empty".
  const isEmpty = data.enteredCount === 0

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Filter className="size-4 text-primary" /> Conversion by Stage
          </CardTitle>
          <CardDescription>
            {isEmpty
              ? "How deals progress through the pipeline"
              : `${nf.format(data.enteredCount)} entered · ${nf.format(data.wonCount)} won · ${data.overallConversion}% overall`}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            icon={Filter}
            title="No deals in the funnel"
            description="Conversion appears once opportunities enter the pipeline."
          />
        ) : (
          <div className="space-y-3">
            {data.stages.map((s) => (
              <div key={s.stage} className="flex items-center gap-3">
                <div className="w-36 shrink-0">
                  <div className="truncate text-sm font-medium">{s.label}</div>
                  <div className="text-caption tabular-nums text-muted-foreground">
                    {nf.format(s.reached)} {s.reached === 1 ? "deal" : "deals"}
                  </div>
                </div>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted/40">
                  <div
                    className="h-full rounded-md"
                    style={{
                      width: `${Math.max(s.pctOfTop, 1)}%`,
                      backgroundColor: stageChartColor(s.stage),
                    }}
                    aria-hidden
                  />
                </div>
                <div className="w-24 shrink-0 text-right">
                  <div className="text-sm font-medium tabular-nums">
                    {s.pctOfTop}%
                  </div>
                  <div className="text-caption tabular-nums text-muted-foreground">
                    {s.conversionFromPrev === null
                      ? "of total"
                      : `${s.conversionFromPrev}% step`}
                  </div>
                </div>
              </div>
            ))}
            {data.lostCount > 0 ? (
              <p className="pt-1 text-caption text-muted-foreground">
                {nf.format(data.lostCount)} closed-lost{" "}
                {data.lostCount === 1 ? "deal" : "deals"} excluded from the funnel.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
