import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TargetProgress } from "@/lib/data/sales-targets"

/** Current-quarter quota progress: won + weighted pipeline vs target (ORR-726). */
export function TargetProgressCard({
  progress,
  locale,
}: {
  progress: TargetProgress
  locale: string
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: progress.currency,
      maximumFractionDigits: 0,
    }).format(n)

  if (!progress.hasTarget) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quarter target · {progress.quarterLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No target set for {progress.quarterLabel}. An admin can set quotas under
            Sales Targets.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (progress.targetUnconvertible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quarter target · {progress.quarterLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            A target is set{progress.targetCurrency ? ` in ${progress.targetCurrency}` : ""}, but
            there&apos;s no exchange rate to {progress.currency}, so quota progress can&apos;t be
            shown. Add an FX rate or set the target in {progress.currency}.
          </p>
        </CardContent>
      </Card>
    )
  }

  const pct = progress.attainmentPct ?? 0
  const clamped = Math.min(100, Math.max(0, pct))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quarter target · {progress.quarterLabel}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Won</span>
          <span className="font-semibold tabular-nums">
            {fmt(progress.wonAmount)}{" "}
            <span className="font-normal text-muted-foreground">/ {fmt(progress.targetAmount)}</span>
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${clamped}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{pct.toFixed(0)}% of quota</span>
          <span className="tabular-nums">Weighted pipeline: {fmt(progress.weightedAmount)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
